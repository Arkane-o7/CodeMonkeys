// AI Service Layer for Enhanced Autonomous Web Agent
// Handles Gemini API integration and intelligent decision making

class AIService {
    constructor() {
        this.apiKey = null;
        this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        this.initialized = false;
        this.contextMemory = {};
        
        this.loadConfiguration();
    }

    async loadConfiguration() {
        try {
            // Try to load API key from storage
            const result = await chrome.storage.local.get(['geminiApiKey']);
            if (result.geminiApiKey) {
                this.apiKey = result.geminiApiKey;
                this.initialized = true;
                console.log('AI Service initialized with stored API key');
            } else {
                console.log('AI Service waiting for API key configuration');
            }
        } catch (error) {
            console.error('Error loading AI configuration:', error);
        }
    }

    async setApiKey(apiKey) {
        try {
            this.apiKey = apiKey;
            await chrome.storage.local.set({ geminiApiKey: apiKey });
            this.initialized = true;
            console.log('AI Service API key configured');
            return true;
        } catch (error) {
            console.error('Error setting API key:', error);
            return false;
        }
    }

    isInitialized() {
        return this.initialized && this.apiKey;
    }

    // Generate high-level plan for user's goal
    async generateHighLevelPlan(userGoal, currentPageInfo = null) {
        if (!this.isInitialized()) {
            throw new Error('AI Service not initialized. Please configure Gemini API key.');
        }

        const prompt = `
You are an autonomous web agent. The user wants to: "${userGoal}"

Current page info: ${currentPageInfo ? JSON.stringify(currentPageInfo) : 'Not available'}

Create a logical, high-level plan to achieve this goal. Break it down into clear, actionable steps.
Each step should be specific enough to guide web automation actions.

Respond with a JSON object in this format:
{
    "plan": [
        {
            "step": 1,
            "description": "Clear description of what to do",
            "goal": "Specific objective for this step"
        }
    ],
    "estimatedSteps": number,
    "requiresUserInput": boolean,
    "potentialChallenges": ["challenge1", "challenge2"]
}
`;

        try {
            const response = await this.callGeminiAPI(prompt);
            return this.parseJSONResponse(response);
        } catch (error) {
            console.error('Error generating high-level plan:', error);
            throw error;
        }
    }

    // Analyze HTML and structure interactive elements
    async analyzePageStructure(htmlContent, currentGoal = null) {
        if (!this.isInitialized()) {
            throw new Error('AI Service not initialized. Please configure Gemini API key.');
        }

        const prompt = `
Analyze this HTML and convert it into a structured JSON object representing all interactive elements.
Current goal context: ${currentGoal || 'General analysis'}

HTML Content (truncated if too long):
${htmlContent.length > 5000 ? htmlContent.substring(0, 5000) + '...[truncated]' : htmlContent}

For each interactive element (<a>, <button>, <input>, <select>, <textarea>, clickable divs, etc.), create an object with:
- agent_id: short, descriptive string identifier
- element_type: type of element (button, link, input, etc.)
- description: clear description of its purpose/content
- selector: CSS selector to target this element
- text_content: visible text if any
- form_context: if it's part of a form, describe the form's purpose

Focus only on elements that could be relevant for web automation.

Respond with JSON:
{
    "interactive_elements": [
        {
            "agent_id": "search_button",
            "element_type": "button",
            "description": "Main search button to submit search query",
            "selector": "button[type='submit']",
            "text_content": "Search",
            "form_context": "search form"
        }
    ],
    "page_summary": "Brief description of the page content and purpose",
    "navigation_state": "Description of where the user currently is"
}
`;

        try {
            const response = await this.callGeminiAPI(prompt);
            return this.parseJSONResponse(response);
        } catch (error) {
            console.error('Error analyzing page structure:', error);
            throw error;
        }
    }

    // Decide next action based on goal, page structure, and context
    async decideNextAction(currentStepGoal, structuredUI, contextMemory) {
        if (!this.isInitialized()) {
            throw new Error('AI Service not initialized. Please configure Gemini API key.');
        }

        const prompt = `
You are an autonomous web agent. Your current goal is: "${currentStepGoal}"

Your memory/context from previous steps:
${JSON.stringify(contextMemory, null, 2)}

Current page UI elements:
${JSON.stringify(structuredUI, null, 2)}

Determine the single best action to take next. Valid actions are:
- goto: Navigate to a URL
- click: Click an element
- type: Type text into an input field
- select: Select option from dropdown
- scroll: Scroll the page
- hover: Hover over an element
- wait_for_element: Wait for an element to appear
- handle_popup: Handle popup or dialog

Respond with JSON:
{
    "action": {
        "type": "action_type",
        "parameters": {
            "selector": "CSS selector if needed",
            "text": "text to type or element text to find",
            "url": "URL for navigation",
            "direction": "up/down for scroll",
            "timeout": "timeout in ms for wait_for_element"
        }
    },
    "expected_outcome": "Detailed description of what should happen if the action succeeds (e.g., 'The page should navigate to login form, and username input field should be visible')",
    "confidence": "high/medium/low",
    "reasoning": "Explanation of why this action was chosen"
}
`;

        try {
            const response = await this.callGeminiAPI(prompt);
            return this.parseJSONResponse(response);
        } catch (error) {
            console.error('Error deciding next action:', error);
            throw error;
        }
    }

    // Verify if action outcome was achieved
    async verifyActionOutcome(expectedOutcome, newPageContent, actionTaken) {
        if (!this.isInitialized()) {
            throw new Error('AI Service not initialized. Please configure Gemini API key.');
        }

        const prompt = `
Verify if the expected outcome was achieved after taking an action.

Action taken: ${JSON.stringify(actionTaken)}
Expected outcome: "${expectedOutcome}"

New page content (key parts):
${newPageContent.length > 3000 ? newPageContent.substring(0, 3000) + '...[truncated]' : newPageContent}

Analyze if the expected outcome was achieved. Look for:
- Page navigation changes
- New elements appearing
- Form submissions
- Content changes
- Error messages

Respond with JSON:
{
    "success": true/false,
    "reason": "Detailed explanation of why it succeeded or failed",
    "observed_changes": ["change1", "change2"],
    "next_suggestion": "What to do next if this failed, or null if succeeded"
}
`;

        try {
            const response = await this.callGeminiAPI(prompt);
            return this.parseJSONResponse(response);
        } catch (error) {
            console.error('Error verifying action outcome:', error);
            throw error;
        }
    }

    // Handle error recovery and re-orientation
    async handleErrorRecovery(originalGoal, failedStep, currentPageInfo, retryCount) {
        if (!this.isInitialized()) {
            throw new Error('AI Service not initialized. Please configure Gemini API key.');
        }

        const prompt = `
The autonomous web agent is lost and needs to re-orient.

Original goal: "${originalGoal}"
Failed step: "${failedStep}"
Retry count: ${retryCount}

Current page info:
${JSON.stringify(currentPageInfo, null, 2)}

Provide a recovery strategy. Options:
1. Try a different approach to the same step
2. Go back to a previous step
3. Find an alternative path to the goal
4. Ask user for help

Respond with JSON:
{
    "recovery_strategy": "alternative_approach/go_back/alternative_path/ask_user",
    "new_action": {
        "type": "action_type",
        "parameters": {}
    },
    "explanation": "Why this recovery approach was chosen",
    "user_message": "Message to show user if asking for help, or null"
}
`;

        try {
            const response = await this.callGeminiAPI(prompt);
            return this.parseJSONResponse(response);
        } catch (error) {
            console.error('Error handling error recovery:', error);
            throw error;
        }
    }

    // Call Gemini API with request
    async callGeminiAPI(prompt) {
        if (!this.apiKey) {
            throw new Error('Gemini API key not configured');
        }

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
            }
        };

        try {
            const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Invalid response format from Gemini API');
            }
        } catch (error) {
            console.error('Gemini API call failed:', error);
            throw error;
        }
    }

    // Parse JSON response from AI, handle potential parsing errors
    parseJSONResponse(responseText) {
        try {
            // Clean up the response text - sometimes AI adds extra formatting
            let cleanText = responseText.trim();
            
            // Remove markdown code block formatting if present
            if (cleanText.startsWith('```json')) {
                cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
            } else if (cleanText.startsWith('```')) {
                cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '');
            }
            
            return JSON.parse(cleanText);
        } catch (error) {
            console.error('Failed to parse AI response as JSON:', error);
            console.error('Response text:', responseText);
            throw new Error('AI returned invalid JSON response');
        }
    }

    // Update context memory
    updateContext(key, value) {
        this.contextMemory[key] = value;
        this.contextMemory.lastUpdated = new Date().toISOString();
    }

    // Get context memory
    getContext() {
        return { ...this.contextMemory };
    }

    // Clear context memory
    clearContext() {
        this.contextMemory = {};
    }

    // Save context to persistent storage
    async saveContext() {
        try {
            await chrome.storage.local.set({ 
                agentContext: this.contextMemory 
            });
        } catch (error) {
            console.error('Error saving context:', error);
        }
    }

    // Load context from persistent storage
    async loadContext() {
        try {
            const result = await chrome.storage.local.get(['agentContext']);
            if (result.agentContext) {
                this.contextMemory = result.agentContext;
            }
        } catch (error) {
            console.error('Error loading context:', error);
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIService;
}