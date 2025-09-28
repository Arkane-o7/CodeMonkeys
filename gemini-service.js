/**
 * Gemini API Service for AI-powered decision making and verification
 */

class GeminiService {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.modelCandidates = this.initializeModelCandidates(options.model);
        this.model = this.modelCandidates[0];
        this.baseUrl = this.buildEndpoint(this.model);
        this.temperature = options.temperature || 0.1; // Lower for more deterministic responses
        this.maxRetries = options.maxRetries || 3;
        
        if (!apiKey) {
            throw new Error('Gemini API key is required');
        }
    }

    /**
     * Main query method for interacting with Gemini
     */
    async query(prompt, options = {}) {
        const retries = options.retries || this.maxRetries;

        for (const candidate of this.modelCandidates) {
            console.log(`Trying model: ${candidate}`);
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    console.log(`Making request with model ${candidate}, attempt ${attempt}`);
                    const response = await this.makeRequest(prompt, { ...options, model: candidate });
                    console.log(`Request successful, parsing response for model ${candidate}`);
                    this.model = candidate;
                    this.baseUrl = this.buildEndpoint(candidate);
                    return this.parseResponse(response, options);
                } catch (error) {
                    console.error(`Error with model ${candidate}, attempt ${attempt}:`, error.message);
                    
                    if (this.isModelNotFound(error)) {
                        console.warn(`Gemini model not found (${candidate}). Trying next available model...`);
                        break; // Move to next candidate
                    }

                    const isServiceUnavailable = /\b503\b/.test(error.message);
                    const attemptInfo = `Gemini API attempt ${attempt} failed for model ${candidate}`;
                    console.error(`${attemptInfo}:`, error.message);

                    if (attempt === retries) {
                        if (isServiceUnavailable) {
                            console.warn(`Gemini model ${candidate} returned 503 after ${retries} attempts. Trying next available model...`);
                            break; // Move to next candidate model
                        }

                        const guidance = error.message;
                        throw new Error(`Gemini API failed after ${retries} attempts: ${guidance}`);
                    }
                    
                    // Wait before retry (exponential backoff)
                    await this.wait(Math.pow(2, attempt) * 1000);
                }
            }
        }

        throw new Error('Gemini API models are unavailable. Verify your API key and enabled models in Google AI Studio.');
    }

    /**
     * Make HTTP request to Gemini API
     */
    async makeRequest(prompt, options = {}) {
        const requestBody = {
            contents: [{
                parts: [{
                    text: this.formatPrompt(prompt, options)
                }]
            }],
            generationConfig: {
                temperature: options.temperature || this.temperature,
                maxOutputTokens: options.maxTokens || 2048,
                topP: options.topP || 0.8,
                topK: options.topK || 40
            }
        };

        const endpoint = options.model ? this.buildEndpoint(options.model) : this.baseUrl;

        const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const retryAfterHeader = response.headers?.get?.('retry-after');
            const retryDetails = Array.isArray(errorData?.error?.details)
                ? errorData.error.details.find(detail => detail?.retryDelay)
                : null;

            let extra = '';
            if (retryAfterHeader) {
                extra += ` Retry-After header: ${retryAfterHeader}.`;
            }
            if (retryDetails?.retryDelay) {
                const seconds = Number(retryDetails.retryDelay.seconds || 0);
                const nanos = Number(retryDetails.retryDelay.nanos || 0) / 1e9;
                const total = seconds + nanos;
                if (total > 0) {
                    extra += ` Retry delay suggested: ${total.toFixed(2)}s.`;
                }
            }

            throw new Error(`Gemini API error ${response.status}: ${errorData.error?.message || response.statusText}.${extra}`);
        }

        return await response.json();
    }

    initializeModelCandidates(preferredModel) {
        const defaults = [
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash'
        ];

        if (preferredModel) {
            return [preferredModel, ...defaults.filter(model => model !== preferredModel)];
        }

        return defaults;
    }

    isModelNotFound(error) {
        if (!error || !error.message) {
            return false;
        }

        return /\b404\b/.test(error.message) && error.message.includes('models/');
    }

    buildEndpoint(modelName) {
        const model = modelName || this.model;
        return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    }

    /**
     * Format prompt with system instructions
     */
    formatPrompt(userPrompt, options = {}) {
        const systemInstructions = options.systemInstructions || `
You are an AI assistant helping with web automation tasks. 
Always respond with valid JSON when JSON is requested.
Be precise and concise in your responses.
Focus on actionable information.
        `.trim();

        return `${systemInstructions}

${userPrompt}

Remember to respond with valid JSON when requested, and be specific and actionable in your guidance.`;
    }

    /**
     * Parse and validate API response
     */
    parseResponse(response, options = {}) {
        try {
            // Debug logging to see actual response structure
            console.log('Gemini API Response:', JSON.stringify(response, null, 2));
            
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response format from Gemini API');
            }
            
            if (!response.candidates) {
                throw new Error(`No candidates in response. Response keys: ${Object.keys(response).join(', ')}`);
            }
            
            if (!Array.isArray(response.candidates)) {
                throw new Error(`Candidates is not an array. Type: ${typeof response.candidates}`);
            }
            
            if (response.candidates.length === 0) {
                throw new Error('No response candidates received from Gemini');
            }

            const candidate = response.candidates[0];
            
            if (candidate.finishReason === 'SAFETY') {
                throw new Error('Response blocked by safety filters');
            }

            const text = candidate.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error('No text content in response');
            }

            // If expecting JSON, try to parse it
            const extracted = this.extractJson(text);
            const trimmedExtracted = extracted.trim();

            if (options.expectJson !== false) {
                if (!this.looksLikeJson(trimmedExtracted)) {
                    throw new Error(`Expected JSON response but received: ${text.slice(0, 200)}...`);
                }

                try {
                    return JSON.parse(trimmedExtracted);
                } catch (jsonError) {
                    console.warn('Failed to parse JSON response:', jsonError.message);
                    console.warn('Raw response:', text);
                    
                    // Try to fix common JSON issues
                    const fixedJson = this.fixJsonResponse(text);
                    if (fixedJson) {
                        return fixedJson;
                    }
                    
                    throw new Error(`Gemini returned malformed JSON: ${jsonError.message}`);
                }
            }

            return trimmedExtracted || text;
            
        } catch (error) {
            console.error('Error parsing Gemini response:', error);
            throw new Error(`Failed to parse Gemini response: ${error.message}`);
        }
    }

    /**
     * Check if response looks like JSON
     */
    looksLikeJson(text) {
        const trimmed = text.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    /**
     * Extract JSON from response that might have markdown or other formatting
     */
    extractJson(text) {
        // Remove markdown code blocks
        let cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '');
        
        // Find JSON-like content
        const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return jsonMatch ? jsonMatch[0] : cleaned;
    }

    /**
     * Attempt to fix common JSON parsing issues
     */
    fixJsonResponse(text) {
        try {
            let fixed = this.extractJson(text);
            
            // Fix common issues
            fixed = fixed
                .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
                .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double
                .replace(/\n/g, ' ') // Remove newlines
                .replace(/\s+/g, ' '); // Normalize whitespace
            
            return JSON.parse(fixed);
        } catch (error) {
            return null;
        }
    }

    sanitizeHtmlSnippet(html, maxLength = 2000) {
        if (!html) {
            return '';
        }

        const withoutScripts = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '');

        const collapsedWhitespace = withoutScripts.replace(/\s+/g, ' ').trim();
        const snippet = collapsedWhitespace.length > maxLength
            ? `${collapsedWhitespace.substring(0, maxLength)} ...[truncated]`
            : collapsedWhitespace;

        return snippet;
    }

    extractRetryDelayMs(message = '') {
        if (!message) {
            return 0;
        }

        const retryInMatch = message.match(/retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s/i);
        if (retryInMatch) {
            const seconds = parseFloat(retryInMatch[1]);
            if (!Number.isNaN(seconds) && seconds > 0) {
                return seconds * 1000;
            }
        }

        const headerMatch = message.match(/Retry-After header:\s*([0-9.]+)/i);
        if (headerMatch) {
            const seconds = parseFloat(headerMatch[1]);
            if (!Number.isNaN(seconds) && seconds > 0) {
                return seconds * 1000;
            }
        }

        const suggestedMatch = message.match(/Retry delay suggested:\s*([0-9.]+)s/i);
        if (suggestedMatch) {
            const seconds = parseFloat(suggestedMatch[1]);
            if (!Number.isNaN(seconds) && seconds > 0) {
                return seconds * 1000;
            }
        }

        return 0;
    }

    /**
     * Specialized method for task triage
     */
    async triageTask(userPrompt) {
        const prompt = `
Analyze this user request and determine if it requires web interaction:
"${userPrompt}"

Consider:
- Does it ask to visit a website, search online, fill forms, make purchases, etc.?
- Can it be answered with general knowledge without web browsing?

Respond with JSON:
{
    "task_type": "simple_query" | "agentic_task",
    "reasoning": "explanation of classification",
    "confidence": 0.0-1.0
}
        `;

        try {
            const result = await this.query(prompt);
            console.log('Triage query result:', result);
            return result;
        } catch (error) {
            console.error('Triage task error:', error);
            throw error;
        }
    }

    /**
     * Generate high-level plan
     */
    async generatePlan(goal) {
        const prompt = `
Create a high-level execution plan for: "${goal}"

Break it down into 3-8 logical steps that can be executed sequentially.
Each step should be specific and measurable.

Respond with JSON:
{
    "plan": [
        {
            "step_id": 1,
            "description": "brief step description",
            "goal": "specific measurable objective",
            "estimated_time": "rough time estimate"
        }
    ],
    "total_steps": number,
    "complexity": "low" | "medium" | "high"
}
        `;

        return await this.query(prompt);
    }

    /**
     * Analyze DOM and extract interactive elements
     */
    async analyzeDom(htmlContent) {
        const cleanedHtml = this.sanitizeHtmlSnippet(htmlContent, 2500);

        const prompt = `
Analyze this HTML snippet and list interactive elements (link, button, input, select, textarea).
Return concise JSON only.

HTML:
${cleanedHtml}

JSON schema:
{
  "interactive_elements": [
    {
      "agent_id": "short id",
      "element_type": "button|link|input|select|textarea",
      "description": "purpose",
      "selector": "CSS selector or xpath",
      "text_content": "visible label",
      "attributes": { "id": "", "name": "", "class": "", "type": "" },
      "location": "approximate position"
    }
  ],
  "page_summary": "brief",
  "total_elements": number
}
        `;

        return await this.query(prompt);
    }

    /**
     * Make decisions for next action
     */
    async decideNextAction(currentGoal, overallGoal, context, availableElements) {
        const prompt = `
DECISION MAKING FOR WEB AUTOMATION AGENT

Current Step Goal: "${currentGoal}"
Overall Objective: "${overallGoal}"
Agent Memory/Context: ${JSON.stringify(context)}

Available UI Elements:
${JSON.stringify(availableElements)}

Determine the single best action to take next.

Available Actions:
- goto: Navigate to a URL
- click: Click an element
- type: Type text into an input field
- select: Select option from dropdown
- scroll: Scroll page up/down
- hover: Hover over element
- wait_for_element: Wait for element to appear
- handle_popup: Handle popup/modal

Respond with JSON:
{
    "action": {
        "type": "action_type",
        "parameters": {
            "selector": "element selector or agent_id",
            "value": "text to type or option to select",
            "url": "url to navigate to",
            "direction": "up|down for scroll",
            "amount": "scroll amount in pixels"
        }
    },
    "expected_outcome": "specific description of what should happen after this action",
    "reasoning": "why this action was chosen over alternatives",
    "confidence": 0.0-1.0
}
        `;

        return await this.query(prompt);
    }

    /**
     * Verify action outcomes
     */
    async verifyOutcome(expectedOutcome, actualPageContent, previousAction) {
        const prompt = `
OUTCOME VERIFICATION

Expected Outcome: "${expectedOutcome}"
Previous Action: ${JSON.stringify(previousAction)}

Current Page Content (first 2000 chars):
${actualPageContent.substring(0, 2000)}

Did the action achieve the expected outcome?

Respond with JSON:
{
    "success": true|false,
    "reason": "detailed explanation",
    "evidence": "specific content that supports the conclusion",
    "suggestions": "if failed, what to try next"
}
        `;

        return await this.query(prompt);
    }

    /**
     * Extract context updates
     */
    async extractContextUpdate(stepDescription, actionTaken, outcome, currentContext) {
        const prompt = `
CONTEXT UPDATE EXTRACTION

Completed Step: "${stepDescription}"
Action Taken: ${JSON.stringify(actionTaken)}
Outcome: "${outcome}"
Current Context: ${JSON.stringify(currentContext)}

What new information should be stored in the agent's memory?
Extract any relevant data like: form values entered, pages visited, items selected, errors encountered, etc.

Respond with JSON:
{
    "new_context": {
        "key": "value for any new information to remember"
    },
    "context_summary": "brief summary of what was learned"
}
        `;

        return await this.query(prompt);
    }

    /**
     * Handle re-orientation when agent gets lost
     */
    async reorient(originalGoal, failedStep, currentPageTitle, availableElements, context) {
        const prompt = `
AGENT RE-ORIENTATION

Original Goal: "${originalGoal}"
Failed Step: "${failedStep}"
Current Page: "${currentPageTitle}"
Available Elements: ${JSON.stringify(availableElements)}
Current Context: ${JSON.stringify(context)}

The agent appears to be lost. How should it recover?

Respond with JSON:
{
    "recovery_strategy": "retry_step|skip_step|new_plan|ask_user",
    "reasoning": "explanation of the chosen strategy",
    "new_action": "if retry_step, provide new action to try",
    "questions": "if ask_user, what questions to ask"
}
        `;

        return await this.query(prompt);
    }

    /**
     * Utility method to add delay
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Health check for API availability
     */
    async healthCheck() {
        try {
            const response = await this.query('Say "API is working" in JSON format', {
                maxRetries: 1
            });
            return { healthy: true, response };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeminiService;
}