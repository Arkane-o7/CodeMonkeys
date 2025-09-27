/**
 * Enhanced Autonomous AI Web Agent
 * Implements the Observe -> Decide -> Act -> Verify workflow
 */

class AutonomousWebAgent {
    constructor(geminiApiKey, options = {}) {
        this.geminiApiKey = geminiApiKey;
        this.context = {}; // Persistent memory throughout the task
        this.originalGoal = '';
        this.currentPlan = [];
        this.currentStepIndex = 0;
        this.retryCount = {};
        this.maxRetries = options.maxRetries || 3;
        
        // Initialize components
        this.geminiService = new GeminiService(geminiApiKey);
        this.domAnalyzer = new DOMAnalyzer();
        this.webAutomation = new WebAutomation();
        this.errorHandler = new ErrorHandler(this);
        this.userInteraction = new UserInteraction();
        
        // Workflow state
        this.isExecuting = false;
        this.currentStep = null;
        this.lastAction = null;
        
        this.log('🤖 Autonomous Web Agent initialized');
    }

    /**
     * Main entry point - processes user request
     */
    async processUserRequest(userPrompt) {
        this.log(`📝 Processing user request: ${userPrompt}`);
        
        try {
            // Step A: Initial Triage and Planning
            const taskType = await this.triageTask(userPrompt);
            
            if (taskType === 'simple_query') {
                return await this.handleSimpleQuery(userPrompt);
            }
            
            // Initialize state for agentic task
            this.originalGoal = userPrompt;
            this.context = {};
            this.currentStepIndex = 0;
            this.retryCount = {};
            
            // Generate high-level plan
            this.currentPlan = await this.generateHighLevelPlan(userPrompt);
            this.log(`📋 Generated plan with ${this.currentPlan.length} steps`);
            
            // Step B: Execute the plan
            return await this.executeWorkflow();
            
        } catch (error) {
            this.log(`❌ Error processing request: ${error.message}`, 'error');
            return {
                success: false,
                error: error.message,
                context: this.context
            };
        }
    }

    /**
     * Step A: Triage - Determine if task needs web interaction
     */
    async triageTask(userPrompt) {
        const prompt = `
        Analyze this user request and determine if it requires web interaction:
        "${userPrompt}"
        
        Respond with JSON:
        {
            "task_type": "simple_query" | "agentic_task",
            "reasoning": "explanation of why this classification was chosen"
        }
        `;
        
        const response = await this.geminiService.query(prompt);
        this.log(`🔍 Task triage: ${response.task_type}`);
        return response.task_type;
    }

    /**
     * Handle simple queries that don't need web interaction
     */
    async handleSimpleQuery(userPrompt) {
        const response = await this.geminiService.query(userPrompt);
        return {
            success: true,
            type: 'simple_answer',
            response: response,
            context: this.context
        };
    }

    /**
     * Generate high-level plan for complex tasks
     */
    async generateHighLevelPlan(goal) {
        const prompt = `
        Create a high-level plan to achieve this goal: "${goal}"
        
        Break it down into logical steps that can be executed on web pages.
        Each step should be a clear, actionable objective.
        
        Respond with JSON:
        {
            "plan": [
                {
                    "step_id": 1,
                    "description": "Navigate to the target website",
                    "goal": "specific objective for this step"
                },
                ...
            ]
        }
        `;
        
        const response = await this.geminiService.query(prompt);
        return response.plan;
    }

    /**
     * Step B: Main execution workflow
     */
    async executeWorkflow() {
        this.isExecuting = true;
        
        while (this.currentStepIndex < this.currentPlan.length && this.isExecuting) {
            this.currentStep = this.currentPlan[this.currentStepIndex];
            this.log(`🎯 Executing step ${this.currentStepIndex + 1}/${this.currentPlan.length}: ${this.currentStep.description}`);
            
            try {
                const success = await this.executeStep(this.currentStep);
                
                if (success) {
                    this.log(`✅ Step ${this.currentStepIndex + 1} completed successfully`);
                    this.currentStepIndex++;
                    this.retryCount[this.currentStepIndex] = 0;
                } else {
                    await this.handleStepFailure(this.currentStep);
                }
                
            } catch (error) {
                this.log(`❌ Step ${this.currentStepIndex + 1} failed: ${error.message}`, 'error');
                await this.handleStepFailure(this.currentStep, error);
            }
        }
        
        this.isExecuting = false;
        
        if (this.currentStepIndex >= this.currentPlan.length) {
            return await this.completeTask();
        } else {
            return {
                success: false,
                message: 'Task execution was interrupted or failed',
                context: this.context
            };
        }
    }

    /**
     * Execute a single step using the Observe -> Decide -> Act -> Verify loop
     */
    async executeStep(step) {
        try {
            // OBSERVE: Analyze the DOM
            const structuredUI = await this.observe();
            
            // DECIDE: Generate next action and expected outcome
            const decision = await this.decide(step, structuredUI);
            
            // VALIDATE: Check for user input requirements
            if (await this.requiresUserInput(decision)) {
                const userInput = await this.requestUserInput(decision);
                decision.action.parameters = { ...decision.action.parameters, ...userInput };
            }
            
            // ACT: Execute the command
            this.lastAction = decision;
            await this.act(decision.action);
            
            // VERIFY: Confirm the outcome
            const verification = await this.verify(decision.expected_outcome);
            
            // UPDATE CONTEXT: Update memory
            if (verification.success) {
                await this.updateContext(step, decision, verification);
                return true;
            } else {
                this.log(`❌ Verification failed: ${verification.reason}`, 'error');
                return false;
            }
            
        } catch (error) {
            this.log(`❌ Step execution error: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * OBSERVE: Analyze current page DOM
     */
    async observe() {
        this.log('👁️ Observing current page...');
        
        // Get current page HTML
        const html = await this.webAutomation.getCurrentPageHTML();
        
        // Convert to structured JSON using Gemini
        const prompt = `
        Analyze this HTML and convert it into a structured JSON object representing all interactive elements 
        (<a>, <button>, <input>, <select>, <textarea>, etc.). For each element, create an object with:
        - agent_id: a short, descriptive string identifier
        - element_type: the HTML tag type
        - description: purpose/function of the element
        - attributes: relevant attributes (id, class, name, etc.)
        - text_content: visible text content
        - location: approximate position description
        
        HTML Content:
        ${html}
        
        Respond with JSON:
        {
            "interactive_elements": [...]
        }
        `;
        
        const response = await this.geminiService.query(prompt);
        this.log(`📋 Found ${response.interactive_elements.length} interactive elements`);
        
        return response.interactive_elements;
    }

    /**
     * DECIDE: Generate next action based on goal and UI
     */
    async decide(step, structuredUI) {
        this.log('🤔 Deciding next action...');
        
        const prompt = `
        My current goal is: "${step.goal}"
        My overall objective is: "${this.originalGoal}"
        My memory/context of previous steps: ${JSON.stringify(this.context)}
        
        Based on these UI elements: ${JSON.stringify(structuredUI)}
        
        What is the single best command to execute next?
        Valid actions are: 'goto', 'click', 'type', 'select', 'scroll', 'hover', 'wait_for_element', 'handle_popup'
        
        Respond with JSON:
        {
            "action": {
                "type": "action_type",
                "parameters": {
                    "selector": "element selector or agent_id",
                    "value": "value to input (if applicable)",
                    "url": "url to navigate (if applicable)"
                }
            },
            "expected_outcome": "detailed description of what should happen",
            "reasoning": "why this action was chosen"
        }
        `;
        
        const decision = await this.geminiService.query(prompt);
        this.log(`💡 Decision: ${decision.action.type} - ${decision.reasoning}`);
        
        return decision;
    }

    /**
     * ACT: Execute the decided action
     */
    async act(action) {
        this.log(`⚡ Executing action: ${action.type}`);
        return await this.webAutomation.executeAction(action);
    }

    /**
     * VERIFY: Check if expected outcome was achieved
     */
    async verify(expectedOutcome) {
        this.log('✅ Verifying action outcome...');
        
        // Get new page state
        const newPageContent = await this.webAutomation.getCurrentPageHTML();
        
        const prompt = `
        Did the previous action succeed?
        Expected outcome: "${expectedOutcome}"
        New page content (first 2000 chars): "${newPageContent.substring(0, 2000)}"
        
        Respond with JSON:
        {
            "success": true/false,
            "reason": "explanation of success or failure",
            "evidence": "specific content that supports the conclusion"
        }
        `;
        
        const verification = await this.geminiService.query(prompt);
        this.log(`🔍 Verification: ${verification.success ? 'SUCCESS' : 'FAILED'} - ${verification.reason}`);
        
        return verification;
    }

    /**
     * Update context with new information
     */
    async updateContext(step, decision, verification) {
        if (verification.success) {
            // Extract any new information to store in context
            const prompt = `
            Based on the successful completion of this step:
            Step: ${step.description}
            Action taken: ${JSON.stringify(decision.action)}
            Outcome: ${verification.evidence}
            
            What new information should be stored in the agent's memory/context?
            Current context: ${JSON.stringify(this.context)}
            
            Respond with JSON of any new context to merge:
            {
                "new_context": {...}
            }
            `;
            
            const contextUpdate = await this.geminiService.query(prompt);
            Object.assign(this.context, contextUpdate.new_context);
            
            this.log(`💾 Context updated: ${JSON.stringify(contextUpdate.new_context)}`);
        }
    }

    /**
     * Handle step failures and implement recovery
     */
    async handleStepFailure(step, error = null) {
        const stepId = this.currentStepIndex;
        this.retryCount[stepId] = (this.retryCount[stepId] || 0) + 1;
        
        this.log(`🔄 Step ${stepId + 1} failed, retry ${this.retryCount[stepId]}/${this.maxRetries}`);
        
        if (this.retryCount[stepId] < this.maxRetries) {
            // Simple retry
            return;
        } else {
            // Initiate re-orientation
            await this.reorientAgent();
        }
    }

    /**
     * Re-orientation when agent gets lost
     */
    async reorientAgent() {
        this.log('🧭 Attempting to re-orient agent...');
        
        const currentPageTitle = await this.webAutomation.getPageTitle();
        const currentElements = await this.observe();
        
        const prompt = `
        I am lost. My original goal was: "${this.originalGoal}"
        My last attempted step was: "${this.currentStep.description}"
        I am now on a page titled: "${currentPageTitle}"
        
        Available UI elements: ${JSON.stringify(currentElements)}
        My current context: ${JSON.stringify(this.context)}
        
        How can I get back on track? Should I:
        1. Try a different approach for the current step
        2. Skip to a different step in my plan
        3. Generate a new plan
        
        Respond with JSON:
        {
            "recovery_action": "retry_step" | "skip_step" | "new_plan",
            "reasoning": "explanation",
            "new_action": "if retry_step, provide the new action to try"
        }
        `;
        
        const recovery = await this.geminiService.query(prompt);
        
        if (recovery.recovery_action === 'retry_step') {
            // Try the suggested new action
            this.log(`🔄 Retrying with new approach: ${recovery.reasoning}`);
            this.retryCount[this.currentStepIndex] = 0;
        } else if (recovery.recovery_action === 'skip_step') {
            this.log(`⏭️ Skipping current step: ${recovery.reasoning}`);
            this.currentStepIndex++;
        } else if (recovery.recovery_action === 'new_plan') {
            this.log(`📋 Generating new plan: ${recovery.reasoning}`);
            this.currentPlan = await this.generateHighLevelPlan(this.originalGoal);
            this.currentStepIndex = 0;
        }
    }

    /**
     * Complete the task successfully
     */
    async completeTask() {
        this.log('🎉 Task completed successfully!');
        
        const summary = `
        Task: ${this.originalGoal}
        Steps completed: ${this.currentPlan.length}
        Final context: ${JSON.stringify(this.context)}
        `;
        
        return {
            success: true,
            message: 'Task completed successfully',
            summary: summary,
            context: this.context
        };
    }

    /**
     * Check if action requires user input
     */
    async requiresUserInput(decision) {
        const sensitiveActions = ['login', 'password', 'username', 'email', 'phone', 'address'];
        const actionStr = JSON.stringify(decision).toLowerCase();
        
        return sensitiveActions.some(term => actionStr.includes(term));
    }

    /**
     * Request user input for sensitive information
     */
    async requestUserInput(decision) {
        return await this.userInteraction.requestInput(decision);
    }

    /**
     * Logging utility
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
        
        // Send to chat interface
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'AGENT_LOG',
                message: message,
                level: level,
                timestamp: timestamp
            });
        }
    }

    /**
     * Stop execution
     */
    stop() {
        this.isExecuting = false;
        this.log('🛑 Agent execution stopped');
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutonomousWebAgent;
}