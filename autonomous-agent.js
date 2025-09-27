// Enhanced Autonomous AI Web Agent
// Implements the Observe → Decide → Act → Verify Loop

class AutonomousWebAgent {
    constructor(aiService) {
        this.aiService = aiService;
        this.context = {};
        this.currentPlan = null;
        this.currentStep = 0;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.isRunning = false;
        this.userGoal = null;
        this.callbacks = {
            onStatusUpdate: null,
            onActionExecuted: null,
            onUserInputRequired: null,
            onTaskCompleted: null,
            onError: null
        };
    }

    // Set callback functions for UI updates
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    // Main entry point - process user goal
    async processUserGoal(userGoal) {
        this.log('info', `Starting autonomous agent for goal: "${userGoal}"`);
        
        // Step A: Initial Triage and Planning
        if (await this.isSimpleQuery(userGoal)) {
            return this.handleSimpleQuery(userGoal);
        }

        // Initialize state
        this.userGoal = userGoal;
        this.context = {};
        this.currentStep = 0;
        this.retryCount = 0;
        this.isRunning = true;

        try {
            // Generate high-level plan
            await this.generateHighLevelPlan(userGoal);
            
            // Execute the plan step by step
            await this.executeStepByStepLoop();
            
        } catch (error) {
            this.log('error', `Agent execution failed: ${error.message}`);
            this.callbacks.onError?.(error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    // Step A: Initial Triage - determine if this is a simple query
    async isSimpleQuery(userGoal) {
        const simplePatterns = [
            /what is/i,
            /how do I/i,
            /explain/i,
            /define/i,
            /tell me about/i
        ];

        // Check if it's a question that doesn't require web interaction
        return simplePatterns.some(pattern => pattern.test(userGoal)) && 
               !userGoal.toLowerCase().includes('on this page') &&
               !userGoal.toLowerCase().includes('navigate') &&
               !userGoal.toLowerCase().includes('buy') &&
               !userGoal.toLowerCase().includes('search for');
    }

    // Handle simple queries without web automation
    async handleSimpleQuery(query) {
        this.log('info', 'Handling as simple query - no web interaction needed');
        const response = `I understand you're asking: "${query}". However, I'm designed as a web automation agent. For information queries, I recommend asking a general AI assistant. I can help you navigate websites, fill forms, make purchases, search for information online, and perform other web-based tasks.`;
        
        this.callbacks.onTaskCompleted?.({
            success: true,
            message: response,
            actionsPerformed: []
        });
        
        return {
            success: true,
            response: response,
            requiresWebInteraction: false
        };
    }

    // Generate high-level plan using AI
    async generateHighLevelPlan(userGoal) {
        this.updateStatus('Analyzing goal and creating plan...');
        
        try {
            // Get current page info
            const currentPageInfo = await this.getCurrentPageInfo();
            
            // Generate plan using AI
            const planResult = await this.aiService.generateHighLevelPlan(userGoal, currentPageInfo);
            this.currentPlan = planResult;
            
            this.log('info', `Generated plan with ${planResult.plan.length} steps`);
            this.log('info', `Plan: ${JSON.stringify(planResult.plan, null, 2)}`);
            
            // Check if user input is required
            if (planResult.requiresUserInput) {
                const inputNeeded = await this.checkForRequiredUserInput();
                if (inputNeeded) {
                    await this.requestUserInput(inputNeeded);
                }
            }
            
            this.updateStatus(`Plan created: ${planResult.plan.length} steps to complete`);
            
        } catch (error) {
            this.log('error', `Failed to generate plan: ${error.message}`);
            throw new Error(`Plan generation failed: ${error.message}`);
        }
    }

    // Step B: Execute step-by-step loop
    async executeStepByStepLoop() {
        if (!this.currentPlan || !this.currentPlan.plan) {
            throw new Error('No execution plan available');
        }

        const totalSteps = this.currentPlan.plan.length;
        
        for (this.currentStep = 0; this.currentStep < totalSteps; this.currentStep++) {
            if (!this.isRunning) {
                this.log('info', 'Agent execution stopped by user');
                break;
            }

            const step = this.currentPlan.plan[this.currentStep];
            this.updateStatus(`Step ${this.currentStep + 1}/${totalSteps}: ${step.description}`);
            
            let stepSuccess = false;
            this.retryCount = 0;

            // Retry loop for current step
            while (!stepSuccess && this.retryCount < this.maxRetries) {
                try {
                    stepSuccess = await this.executeStep(step);
                    
                    if (stepSuccess) {
                        this.log('info', `Step ${this.currentStep + 1} completed successfully`);
                        this.retryCount = 0; // Reset retry count for next step
                    } else {
                        this.retryCount++;
                        this.log('warning', `Step ${this.currentStep + 1} failed, retry ${this.retryCount}/${this.maxRetries}`);
                        
                        if (this.retryCount >= this.maxRetries) {
                            // Try error recovery
                            const recovered = await this.handleErrorRecovery(step);
                            if (recovered) {
                                stepSuccess = true;
                                this.retryCount = 0;
                            } else {
                                throw new Error(`Step failed after ${this.maxRetries} retries`);
                            }
                        }
                    }
                } catch (error) {
                    this.log('error', `Step execution error: ${error.message}`);
                    this.retryCount++;
                    
                    if (this.retryCount >= this.maxRetries) {
                        const recovered = await this.handleErrorRecovery(step, error);
                        if (!recovered) {
                            throw error;
                        }
                        stepSuccess = true;
                        this.retryCount = 0;
                    }
                }
            }
        }

        // Task completion
        this.updateStatus('All steps completed successfully!');
        await this.completeTask();
    }

    // Execute a single step using Observe → Decide → Act → Verify
    async executeStep(step) {
        this.log('info', `Executing step: ${step.description}`);

        try {
            // OBSERVE: Analyze the DOM
            const structuredUI = await this.observePage();
            
            // DECIDE: Generate next action and expected outcome
            const decision = await this.decideAction(step.goal, structuredUI);
            
            // VALIDATE: Check for required user input
            await this.validateUserInput(decision.action);
            
            // ACT: Execute the command
            const actionResult = await this.executeAction(decision.action);
            
            // VERIFY: Confirm the outcome
            const verification = await this.verifyOutcome(decision.expected_outcome, decision.action);
            
            // UPDATE CONTEXT: Update memory
            if (verification.success) {
                this.updateContext(step, decision.action, actionResult);
                return true;
            } else {
                this.log('warning', `Step verification failed: ${verification.reason}`);
                return false;
            }
            
        } catch (error) {
            this.log('error', `Step execution failed: ${error.message}`);
            throw error;
        }
    }

    // OBSERVE: Analyze current page DOM
    async observePage() {
        this.log('info', 'OBSERVE: Analyzing current page...');
        
        try {
            // Get page HTML content
            const pageContent = await this.getPageContent();
            
            // Use AI to structure the HTML
            const structuredUI = await this.aiService.analyzePageStructure(
                pageContent.html, 
                this.currentPlan?.plan[this.currentStep]?.goal
            );
            
            this.log('info', `Found ${structuredUI.interactive_elements?.length || 0} interactive elements`);
            return structuredUI;
            
        } catch (error) {
            this.log('error', `OBSERVE phase failed: ${error.message}`);
            throw error;
        }
    }

    // DECIDE: Determine next action using AI
    async decideAction(currentGoal, structuredUI) {
        this.log('info', 'DECIDE: Determining next action...');
        
        try {
            const decision = await this.aiService.decideNextAction(
                currentGoal, 
                structuredUI, 
                this.context
            );
            
            this.log('info', `Decision: ${decision.action.type} - ${decision.reasoning}`);
            this.log('info', `Expected outcome: ${decision.expected_outcome}`);
            
            return decision;
            
        } catch (error) {
            this.log('error', `DECIDE phase failed: ${error.message}`);
            throw error;
        }
    }

    // VALIDATE: Check if user input is required
    async validateUserInput(action) {
        // Check if the action requires sensitive information
        const sensitivePatterns = [
            /password/i,
            /credit card/i,
            /ssn/i,
            /social security/i,
            /bank/i,
            /login/i,
            /username/i,
            /email.*personal/i,
            /personal.*email/i
        ];

        const actionText = JSON.stringify(action).toLowerCase();
        const needsUserInput = sensitivePatterns.some(pattern => pattern.test(actionText));

        if (needsUserInput) {
            this.log('info', 'VALIDATE: User input required for sensitive information');
            await this.requestUserInput({
                type: 'sensitive_data',
                action: action,
                message: 'This action requires sensitive information. Please provide the necessary data to continue.'
            });
        }
    }

    // ACT: Execute the determined action
    async executeAction(action) {
        this.log('info', `ACT: Executing ${action.type}...`);
        
        try {
            // Send action to content script for execution
            const result = await this.sendMessageToContentScript({
                type: 'EXECUTE_ENHANCED_ACTION',
                action: action
            });
            
            this.callbacks.onActionExecuted?.(action, result);
            this.log('info', `Action executed: ${result?.message || 'success'}`);
            
            return result;
            
        } catch (error) {
            this.log('error', `ACT phase failed: ${error.message}`);
            throw error;
        }
    }

    // VERIFY: Confirm the outcome matches expectations
    async verifyOutcome(expectedOutcome, actionTaken) {
        this.log('info', 'VERIFY: Checking action outcome...');
        
        try {
            // Get new page state
            const newPageContent = await this.getPageContent();
            
            // Use AI to verify outcome
            const verification = await this.aiService.verifyActionOutcome(
                expectedOutcome,
                newPageContent.text,
                actionTaken
            );
            
            if (verification.success) {
                this.log('info', `VERIFY: Success - ${verification.reason}`);
            } else {
                this.log('warning', `VERIFY: Failed - ${verification.reason}`);
                if (verification.next_suggestion) {
                    this.log('info', `Suggestion: ${verification.next_suggestion}`);
                }
            }
            
            return verification;
            
        } catch (error) {
            this.log('error', `VERIFY phase failed: ${error.message}`);
            throw error;
        }
    }

    // UPDATE CONTEXT: Update memory with new information
    updateContext(step, action, result) {
        const contextUpdate = {
            step: step,
            action: action,
            result: result,
            timestamp: new Date().toISOString()
        };

        // Add to action history
        if (!this.context.actionHistory) {
            this.context.actionHistory = [];
        }
        this.context.actionHistory.push(contextUpdate);

        // Update relevant context based on action type
        if (action.type === 'type' && action.parameters.text) {
            this.context.lastTypedText = action.parameters.text;
        }
        
        if (action.type === 'navigate' && action.parameters.url) {
            this.context.currentUrl = action.parameters.url;
        }

        if (action.type === 'click' && action.parameters.text) {
            this.context.lastClickedElement = action.parameters.text;
        }

        // Save context
        this.aiService.updateContext('webAgent', this.context);
        this.aiService.saveContext();
        
        this.log('info', 'Context updated with new information');
    }

    // Error recovery and re-orientation
    async handleErrorRecovery(failedStep, error = null) {
        this.log('warning', 'Starting error recovery protocol...');
        
        try {
            const currentPageInfo = await this.getCurrentPageInfo();
            const recovery = await this.aiService.handleErrorRecovery(
                this.userGoal,
                failedStep.description,
                currentPageInfo,
                this.retryCount
            );

            this.log('info', `Recovery strategy: ${recovery.recovery_strategy}`);
            this.log('info', `Recovery explanation: ${recovery.explanation}`);

            if (recovery.recovery_strategy === 'ask_user') {
                await this.requestUserInput({
                    type: 'error_recovery',
                    message: recovery.user_message,
                    failedStep: failedStep
                });
                return true; // User will provide guidance
            } else if (recovery.new_action) {
                // Try the suggested recovery action
                const result = await this.executeAction(recovery.new_action);
                return result.success;
            }

            return false;
            
        } catch (error) {
            this.log('error', `Error recovery failed: ${error.message}`);
            return false;
        }
    }

    // Complete task and provide summary
    async completeTask() {
        const summary = {
            success: true,
            goal: this.userGoal,
            stepsCompleted: this.currentStep + 1,
            totalSteps: this.currentPlan?.plan.length || 0,
            actionsPerformed: this.context.actionHistory || [],
            message: `Successfully completed: "${this.userGoal}"`
        };

        this.log('info', 'Task completed successfully!');
        this.callbacks.onTaskCompleted?.(summary);
        
        // Clear context for next task
        this.aiService.clearContext();
    }

    // Helper methods

    async getCurrentPageInfo() {
        try {
            const pageContent = await this.getPageContent();
            return {
                url: pageContent.url,
                title: pageContent.title,
                description: pageContent.text.substring(0, 500) + '...'
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    async getPageContent() {
        return await this.sendMessageToContentScript({
            type: 'GET_PAGE_CONTENT'
        });
    }

    async sendMessageToContentScript(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('No active tab found');
            }
            
            const response = await chrome.tabs.sendMessage(tab.id, message);
            if (!response?.success) {
                throw new Error(response?.error || 'Content script communication failed');
            }
            
            return response.result;
        } catch (error) {
            this.log('error', `Content script communication error: ${error.message}`);
            throw error;
        }
    }

    async checkForRequiredUserInput() {
        // Check if the current plan requires user-specific information
        const planText = JSON.stringify(this.currentPlan).toLowerCase();
        
        if (planText.includes('login') || planText.includes('password') || planText.includes('username')) {
            return {
                type: 'credentials',
                message: 'This task requires login credentials. Please provide your username and password.'
            };
        }
        
        if (planText.includes('personal information') || planText.includes('address') || planText.includes('phone')) {
            return {
                type: 'personal_info',
                message: 'This task requires personal information. Please provide the necessary details.'
            };
        }
        
        return null;
    }

    async requestUserInput(inputRequest) {
        this.log('info', `Requesting user input: ${inputRequest.type}`);
        this.updateStatus('Waiting for user input...');
        
        return new Promise((resolve) => {
            this.callbacks.onUserInputRequired?.(inputRequest, resolve);
        });
    }

    updateStatus(status) {
        this.log('info', status);
        this.callbacks.onStatusUpdate?.(status);
    }

    log(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] [AutonomousAgent] ${message}`);
    }

    // Control methods
    stop() {
        this.isRunning = false;
        this.log('info', 'Autonomous agent stopped by user');
    }

    isActive() {
        return this.isRunning;
    }

    getCurrentProgress() {
        return {
            currentStep: this.currentStep,
            totalSteps: this.currentPlan?.plan.length || 0,
            retryCount: this.retryCount,
            isRunning: this.isRunning
        };
    }
}