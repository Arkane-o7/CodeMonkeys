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

        // Lightweight DOM observation cache to reduce redundant Gemini calls
        this.domCache = {
            url: null,
            htmlDigest: null,
            elements: null,
            timestamp: 0
        };
        this.domCacheTtl = options.domCacheTtl ?? 15000; // milliseconds
        
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
            this.log(`📋 Generated plan with ${this.currentPlan.length} steps:`);
            
            // Display the plan to the user
            this.currentPlan.forEach((step, index) => {
                this.log(`   ${index + 1}. ${step.description}`);
            });
            
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
        // Get current page context
        let currentUrl = '';
        try {
            currentUrl = typeof this.webAutomation.getActiveTabUrl === 'function'
                ? await this.webAutomation.getActiveTabUrl().catch(() => '')
                : '';
        } catch (error) {
            // Ignore errors, use empty URL
        }

        const prompt = `
        Create a high-level plan to achieve this goal: "${goal}"
        
        Current context:
        - Current page URL: ${currentUrl || 'Unknown'}
        
    Break it down into logical steps that can be executed on web pages.
    Each step should be a clear, actionable objective.
    If we're already on a relevant page (like YouTube search results), don't include unnecessary navigation steps.
    If the goal references LinkedIn and jobs/careers, include steps to open the LinkedIn Jobs section before searching or filtering for roles.
        
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

            // VERIFY: Confirm the outcome (skip for simple nav when detectable)
            let verification;
            if (await this.canAutoVerify(decision)) {
                verification = await this.autoVerifyNavigation(decision);
            }

            if (!verification) {
                verification = await this.verify(decision.expected_outcome);
            }
            
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
        const url = typeof this.webAutomation.getActiveTabUrl === 'function'
            ? await this.webAutomation.getActiveTabUrl().catch(() => '')
            : '';

        if (this.context?.lastUi && this.context.lastUi.url === url) {
            const age = Date.now() - (this.context.lastUi.timestamp || 0);
            if (age <= this.domCacheTtl && Array.isArray(this.context.lastUi.elements)) {
                this.log(`🗃️ Reusing context UI snapshot (${this.context.lastUi.elements.length} elements)`);
                return this.context.lastUi.elements;
            }
        }

        const html = await this.webAutomation.getCurrentPageHTML();
        const normalizedHtml = this.normalizeHtmlForHash(html);
        const htmlDigest = this.computeContentDigest(normalizedHtml);

        if (this.shouldReuseDomCache(url, htmlDigest)) {
            this.log(`♻️ Reusing cached DOM analysis (${this.domCache.elements.length} elements)`);
            return this.domCache.elements;
        }

        // Try local DOM analyzer first (token free)
        try {
            const localAnalysis = await this.domAnalyzer.analyzeCurrentPage();
            if (localAnalysis?.interactive_elements?.length) {
                this.log(`🧠 DOMAnalyzer extracted ${localAnalysis.interactive_elements.length} elements locally`);
                this.updateDomCache(url, htmlDigest, localAnalysis.interactive_elements);
                return localAnalysis.interactive_elements;
            }
        } catch (localError) {
            this.log(`⚠️ Local DOM analyzer failed: ${localError.message}`, 'warning');
        }

        // Fall back to Gemini only if we need richer context
        const prompt = this.buildDomPrompt(normalizedHtml);
        const response = await this.geminiService.query(prompt, { expectJson: true });

        if (!response || typeof response !== 'object') {
            this.log('⚠️ DOM analysis returned non-object response from Gemini', 'warn');
            console.debug('DOM analysis raw response:', response);
            throw new Error('Invalid DOM analysis response');
        }

        const elements = response.interactive_elements;
        if (!Array.isArray(elements)) {
            this.log('⚠️ DOM analysis response missing interactive_elements array', 'warn');
            console.debug('DOM analysis detailed response:', response);
            throw new Error('DOM analysis failed to produce interactive elements');
        }

        this.log(`📋 Gemini extracted ${elements.length} interactive elements`);
        this.updateDomCache(url, htmlDigest, elements);
        
        return elements;
    }

    /**
     * DECIDE: Generate next action based on goal and UI
     */
    async decide(step, structuredUI) {
        this.log('🤔 Deciding next action...');
        
        const prompt = `
GOAL: "${step.goal}"
OVERALL OBJECTIVE: "${this.originalGoal}"
CONTEXT: ${JSON.stringify(this.context)}

AVAILABLE UI ELEMENTS:
${JSON.stringify(structuredUI, null, 2)}

INSTRUCTIONS:
1. Choose ONE action from: 'goto', 'click', 'type', 'search', 'select', 'scroll', 'hover', 'wait_for_element', 'handle_popup'
2. For click/type/search/select actions: MUST include the exact "selector" found in AVAILABLE UI ELEMENTS and include the matching "agent_id" when provided
3. Do NOT invent generic IDs like "input_text_7" or "button_3"—always reuse the precise selector/agent_id pair from AVAILABLE UI ELEMENTS
4. For type/search actions: MUST include the "value" to type/search
5. For goto actions: MUST include the target "url"

CRITICAL: Use exact "selector" or "agent_id" values from the UI elements list above. If both are provided, include BOTH in the action parameters.
NEVER fabricate selectors—prefer IDs (e.g., "#search-global-typeahead-input"), placeholder-based selectors (e.g., "input[placeholder='Search']"), or aria-label selectors supplied above.

LINKEDIN/JOBS CONTEXT: If the goal references LinkedIn and jobs, ensure the plan navigates to the dedicated Jobs section (click the "Jobs" nav link) before performing job searches or filters.

ELEMENT SELECTION PRIORITY:
- For video clicks: Use the most specific selector available AND choose the FIRST video result
- When multiple videos are shown, always select the TOP/FIRST one in the list
- For search inputs: Prioritize actual input elements over wrapper divs
- For buttons: Use button elements over generic clickable divs
- Look for numbered or indexed selectors (like ":first-child", ":nth-child(1)")

IMPORTANT FOR VIDEO SELECTION:
- When search results show multiple videos, click on the FIRST video in the list
- Look for selectors that target the first video specifically
- The first video is usually the most relevant result
- Prefer elements with lower index numbers or "_video_1" patterns
- On YouTube, the top video in search results is typically the official/most relevant one

Example video selection:
If you see multiple videos like:
- {"agent_id": "a_rick_astley_video_1", "description": "Video link (1st/TOP): Rick Astley - Never Gonna Give You Up", "videoPosition": 1}  
- {"agent_id": "a_some_other_video_2", "description": "Video link (2nd): Some remix", "videoPosition": 2}
Always choose the FIRST one (videoPosition: 1 or agent_id ending in "_1" or marked as "1st/TOP")

CRITICAL FOR YOUTUBE: When clicking videos, ALWAYS select the video with videoPosition: 1 or the lowest position number.

ACTION SELECTION PRIORITY:
- Use 'search' action for search inputs (automatically submits after typing) - PREFERRED FOR SEARCH
- Use 'type' action for regular text inputs (non-search fields)
- Use 'click' action for buttons, links, and clickable elements

SEARCH INPUT DETECTION: When the goal mentions "search", "find", or when working with search bars, use the 'search' action instead of 'type'.

IMPORTANT: If the step goal contains words like "search", "find", "look for", or if you're working with YouTube, Google, or other search engines, always prefer the 'search' action over 'type'.

SEARCH INPUT PRIORITY: When looking for search inputs, prioritize elements that are:
- Actual input/textarea elements (element_type: "input", "textarea")
- Have search-related attributes (type="search", placeholder containing "search")
- Have isActualInput: true in their properties

Example for search input:
If UI has: {"agent_id": "search-box", "selector": "input[type='search']", "element_type": "input"}
Then use: "selector": "search-box" or "selector": "input[type='search']"

Respond with JSON:
{
    "action": {
        "type": "action_type",
        "parameters": {
            "selector": "EXACT selector or agent_id from UI elements above",
            "value": "text to type (for type action)",
            "url": "full URL (for goto action)"
        }
    },
    "expected_outcome": "what should happen after this action",
    "reasoning": "why this specific element and action"
}
        `;
        
        const decision = await this.geminiService.query(prompt);
        this.log(`💡 Decision: ${decision.action.type} - ${decision.reasoning}`);
        
        return decision;
    }

    /**
     * ACT: Execute the decided action
     */
    /**
     * ACT: Execute the decided action with validation
     */
    async act(action) {
        this.log(`⚡ Executing action: ${action.type}`);
        
        // Validate action structure
        if (!action || typeof action !== 'object') {
            throw new Error('Action must be an object');
        }
        
        if (!action.type) {
            throw new Error('Action type is required');
        }
        
        if (!action.parameters) {
            throw new Error('Action parameters are required');
        }
        
        this.enrichActionParameters(action);
        // Validate parameters based on action type
        await this.validateActionParameters(action);
        
        return await this.webAutomation.executeAction(action);
    }
    
    /**
     * Validate action parameters based on action type
     */
    async validateActionParameters(action) {
        const { type, parameters } = action;
        
        switch (type.toLowerCase()) {
            case 'goto':
                if (!parameters.url) {
                    throw new Error('URL parameter is required for goto action');
                }
                break;
                
            case 'click':
                if (!parameters.selector && !parameters.agent_id && !parameters.text) {
                    throw new Error('Selector, agent_id, or text parameter is required for click action');
                }
                break;
                
            case 'type':
                if (!parameters.selector && !parameters.agent_id) {
                    throw new Error('Selector or agent_id parameter is required for type action');
                }
                if (!parameters.value && !parameters.text) {
                    throw new Error('Value or text parameter is required for type action');
                }
                break;
                
            case 'search':
                if (!parameters.selector && !parameters.agent_id) {
                    throw new Error('Selector or agent_id parameter is required for search action');
                }
                if (!parameters.value && !parameters.text && !parameters.query) {
                    throw new Error('Value, text, or query parameter is required for search action');
                }
                break;
                
            case 'select':
                if (!parameters.selector && !parameters.agent_id) {
                    throw new Error('Selector or agent_id parameter is required for select action');
                }
                if (!parameters.value && !parameters.option && !parameters.text) {
                    throw new Error('Value, option, or text parameter is required for select action');
                }
                break;
                
            case 'scroll':
                // Scroll can work with default parameters
                break;
                
            case 'hover':
                if (!parameters.selector && !parameters.agent_id) {
                    throw new Error('Selector or agent_id parameter is required for hover action');
                }
                break;
                
            case 'wait_for_element':
                if (!parameters.selector && !parameters.agent_id) {
                    throw new Error('Selector or agent_id parameter is required for wait_for_element action');
                }
                break;
                
            case 'handle_popup':
                // Handle popup can work with default parameters
                break;
                
            default:
                this.log(`⚠️ Unknown action type: ${type}`, 'warning');
        }
    }

    enrichActionParameters(action) {
        if (!action?.parameters || !this.domCache?.elements?.length) {
            return;
        }

        const params = action.parameters;
        const agentId = params.agent_id || params.agentId;
        const selector = params.selector;

        if (!selector && agentId) {
            const element = this.findDomElementByAgentId(agentId);
            const resolvedSelector = this.buildSelectorFromElement(element);
            if (resolvedSelector) {
                params.selector = resolvedSelector;
            }
        }

        if (!params.agent_id && !params.agentId && selector) {
            const element = this.findDomElementBySelector(selector);
            if (element?.agent_id) {
                params.agent_id = element.agent_id;
            }
        }
    }

    findDomElementByAgentId(agentId) {
        if (!agentId || !this.domCache?.elements) {
            return null;
        }
        return this.domCache.elements.find(el => el.agent_id === agentId) || null;
    }

    findDomElementBySelector(selector) {
        if (!selector || !this.domCache?.elements) {
            return null;
        }
        return this.domCache.elements.find(el => el.selector === selector) || null;
    }

    buildSelectorFromElement(element) {
        if (!element) {
            return null;
        }

        if (element.selector) {
            return element.selector;
        }

        const attrs = element.attributes || {};
        if (attrs.id) {
            return `#${attrs.id}`;
        }
        if (attrs.name) {
            return `[name="${attrs.name}"]`;
        }
        if (attrs.placeholder) {
            return `${(element.element_type || 'input').toLowerCase()}[placeholder="${this.escapeAttributeValue(attrs.placeholder)}"]`;
        }
        if (attrs['aria-label']) {
            return `${(element.element_type || 'input').toLowerCase()}[aria-label="${this.escapeAttributeValue(attrs['aria-label'])}"]`;
        }

        if (element.text_content) {
            const cleanText = element.text_content.replace(/"/g, '\\"');
            return `//*[text()="${cleanText}"]`;
        }

        return null;
    }

    escapeAttributeValue(value) {
        if (typeof value !== 'string') {
            return value;
        }
        return value.replace(/"/g, '\\"');
    }

    /**
     * VERIFY: Check if expected outcome was achieved
     */
    async verify(expectedOutcome) {
        this.log('✅ Verifying action outcome...');
        
        // Get new page state
        const newPageContent = await this.webAutomation.getCurrentPageHTML();
        
        // For search actions, check if the page changed (URL or content)
        if (this.lastAction?.action?.type === 'search' || this.lastAction?.action?.type === 'type') {
            const currentUrl = typeof this.webAutomation.getActiveTabUrl === 'function'
                ? await this.webAutomation.getActiveTabUrl().catch(() => '')
                : '';
                
            // If URL contains search parameters or changed significantly, consider it successful
            if (currentUrl.includes('search') || currentUrl.includes('query') || currentUrl.includes('q=')) {
                this.log(`🔍 Verification: SUCCESS - Search executed, URL shows search: ${currentUrl}`);
                return {
                    success: true,
                    reason: 'Search executed successfully - URL shows search parameters',
                    evidence: `URL changed to: ${currentUrl}`
                };
            }
        }
        
        // For click actions on videos (YouTube, etc.), check for video page navigation
        if (this.lastAction?.action?.type === 'click') {
            const currentUrl = typeof this.webAutomation.getActiveTabUrl === 'function'
                ? await this.webAutomation.getActiveTabUrl().catch(() => '')
                : '';
                
            // If URL shows we're on a video page, consider it successful
            if (currentUrl.includes('/watch') || currentUrl.includes('video') || currentUrl.includes('v=')) {
                this.log(`🔍 Verification: SUCCESS - Video clicked, URL shows video page: ${currentUrl}`);
                return {
                    success: true,
                    reason: 'Video clicked successfully - URL shows video page',
                    evidence: `URL changed to video page: ${currentUrl}`
                };
            }
        }
        
        const pageSnippet = this.buildVerificationSnippet(newPageContent);
        
        const prompt = `
        Did the previous action succeed?
        Expected outcome: "${expectedOutcome}"
        Previous action: ${JSON.stringify(this.lastAction?.action || {})}
        HTML evidence snippet:
        """${pageSnippet}"""
        
        VERIFICATION GUIDELINES:
        - If this was a search action and you see search results or suggestions, consider it successful.
        - If this was a click on a video and the URL changed to a video page (/watch, /video, v=), consider it successful even if the video player isn't fully loaded yet.
        - If this was navigation and the URL changed appropriately, consider it successful.
        - Look for evidence of the expected page transition or content change.
        
        Respond with JSON only:
        {
            "success": true/false,
            "reason": "concise explanation",
            "evidence": "specific supporting text"
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

    shouldReuseDomCache(url, digest) {
        if (!this.domCache?.elements) {
            return false;
        }

        const isSameUrl = url && this.domCache.url === url;
        const isSameDigest = digest && this.domCache.htmlDigest === digest;
        const isFresh = Date.now() - this.domCache.timestamp <= this.domCacheTtl;

        return Boolean(isSameUrl && isSameDigest && isFresh);
    }

    updateDomCache(url, digest, elements) {
        this.domCache = {
            url,
            htmlDigest: digest,
            elements: Array.isArray(elements) ? elements : null,
            timestamp: Date.now()
        };

        if (!this.context) {
            this.context = {};
        }

        this.context.lastUi = {
            url,
            htmlDigest: digest,
            elements: Array.isArray(elements) ? [...elements] : null,
            timestamp: Date.now()
        };
    }

    computeContentDigest(content) {
        if (!content) {
            return '0';
        }

        let hash = 0;
        const sample = content.length > 5000 ? content.substring(0, 5000) : content;

        for (let i = 0; i < sample.length; i++) {
            hash = (hash * 31 + sample.charCodeAt(i)) >>> 0;
        }

        return hash.toString(16);
    }

    normalizeHtmlForHash(html) {
        if (!html) {
            return '';
        }

        return html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/"clientScreenNonce":"[^"]+"/gi, '')
            .replace(/"visitorData":"[^"]+"/gi, '')
            .replace(/\d{4,}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    buildVerificationSnippet(html, maxLength = 3000) {
        if (!html) {
            return '';
        }

        // Remove scripts and styles entirely
        let sanitized = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<!--[\s\S]*?-->/gi, ''); // Remove comments
        
        // Try to extract more meaningful content by prioritizing:
        // 1. Title, headers, and main content areas
        // 2. Forms and interactive elements
        // 3. Search results and dynamic content
        // 4. Visible text content
        
        const contentPriority = [
            /<title>[\s\S]*?<\/title>/gi,
            /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi,
            /<main[^>]*>[\s\S]*?<\/main>/gi,
            /<form[^>]*>[\s\S]*?<\/form>/gi,
            /<input[^>]*>/gi,
            /<button[^>]*>[\s\S]*?<\/button>/gi,
            /<a[^>]*>[\s\S]*?<\/a>/gi,
            /<select[^>]*>[\s\S]*?<\/select>/gi,
            /<textarea[^>]*>[\s\S]*?<\/textarea>/gi,
            // Search-specific patterns
            /class="[^"]*search[^"]*"[^>]*>[\s\S]*?</gi,
            /id="[^"]*search[^"]*"[^>]*>[\s\S]*?</gi,
            /placeholder="[^"]*search[^"]*"/gi,
            // Results and listings
            /class="[^"]*result[^"]*"[^>]*>[\s\S]*?</gi,
            /class="[^"]*item[^"]*"[^>]*>[\s\S]*?</gi,
            // Video player specific
            /class="[^"]*player[^"]*"[^>]*>[\s\S]*?</gi,
            /class="[^"]*video[^"]*"[^>]*>[\s\S]*?</gi,
            /<video[^>]*>[\s\S]*?<\/video>/gi,
            /id="[^"]*player[^"]*"[^>]*>[\s\S]*?</gi,
            // YouTube specific
            /class="[^"]*ytd-watch[^"]*"[^>]*>[\s\S]*?</gi,
            /class="[^"]*ytd-player[^"]*"[^>]*>[\s\S]*?</gi
        ];
        
        let priorityContent = '';
        contentPriority.forEach(regex => {
            const matches = sanitized.match(regex) || [];
            matches.forEach(match => {
                if (priorityContent.length < maxLength * 0.6) {
                    priorityContent += match + '\n';
                }
            });
        });
        
        // Combine priority content with beginning of the full content
        const remainder = maxLength - priorityContent.length;
        if (remainder > 0) {
            const restContent = sanitized
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, remainder);
            sanitized = priorityContent + restContent;
        } else {
            sanitized = priorityContent;
        }
        
        // Final cleanup
        sanitized = sanitized
            .replace(/\s+/g, ' ')
            .trim();

        return sanitized.length > maxLength
            ? `${sanitized.substring(0, maxLength)} ...[content continues]`
            : sanitized;
    }

    async canAutoVerify(decision) {
        if (!decision?.action) {
            return false;
        }

        const actionType = (decision.action.type || '').toLowerCase();
        if (actionType !== 'goto') {
            return false;
        }

        const targetUrl = decision.action.parameters?.url;
        return Boolean(targetUrl);
    }

    async autoVerifyNavigation(decision) {
        try {
            const currentUrl = typeof this.webAutomation.getActiveTabUrl === 'function'
                ? await this.webAutomation.getActiveTabUrl().catch(() => '')
                : '';

            if (!currentUrl) {
                return null;
            }

            const targetUrl = this.normalizeUrl(decision.action.parameters.url);
            const resolvedCurrent = this.normalizeUrl(currentUrl);

            if (!targetUrl || !resolvedCurrent) {
                return null;
            }

            if (resolvedCurrent.hostname === targetUrl.hostname) {
                this.log(`🔍 Verification: AUTO - URL matches expected host ${targetUrl.hostname}`);
                return {
                    success: true,
                    reason: `Navigated to expected host ${targetUrl.hostname}`,
                    evidence: resolvedCurrent.href,
                    autoVerified: true
                };
            }

            return null;
        } catch (error) {
            this.log(`⚠️ Auto verification failed: ${error.message}`, 'warning');
            return null;
        }
    }

    normalizeUrl(url) {
        if (!url) {
            return null;
        }

        try {
            const prefixed = url.startsWith('http') ? url : `https://${url}`;
            return new URL(prefixed);
        } catch (error) {
            return null;
        }
    }

    buildDomPrompt(htmlSnippet) {
        return `
Analyze this HTML and list interactive elements (links, buttons, inputs, selects, textareas).
Provide concise JSON with:
{
  "interactive_elements": [
    {
      "agent_id": "short identifier",
      "element_type": "button|link|input|select|textarea",
      "description": "purpose",
      "selector": "CSS selector or xpath",
      "text_content": "visible text",
      "attributes": { "id": "", "name": "", "class": "", "type": "" },
      "location": "approximate placement"
    }
  ],
  "page_summary": "brief summary",
  "total_elements": number
}

HTML:
${htmlSnippet}
        `;
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