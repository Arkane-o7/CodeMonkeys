/**
 * Error Handler - Manages error recovery and re-orientation
 */

class ErrorHandler {
    constructor(agent) {
        this.agent = agent;
        this.errorHistory = [];
        this.recoveryStrategies = [
            'retry_step',
            'alternative_action',
            'skip_step', 
            'reorient_agent',
            'ask_user_help'
        ];
    }

    /**
     * Handle step failure and determine recovery strategy
     */
    async handleStepFailure(step, error, context) {
        const errorInfo = {
            step: step,
            error: error.message,
            timestamp: new Date().toISOString(),
            context: { ...context },
            attempt: this.getAttemptCount(step.step_id)
        };

        this.errorHistory.push(errorInfo);
        this.log(`Step failure recorded: ${error.message}`, 'error');

        // Determine recovery strategy
        const strategy = await this.determineRecoveryStrategy(errorInfo);
        
        return await this.executeRecoveryStrategy(strategy, errorInfo);
    }

    /**
     * Determine the best recovery strategy
     */
    async determineRecoveryStrategy(errorInfo) {
        const { step, error, attempt } = errorInfo;
        
        // Simple retry for first few attempts
        if (attempt <= 2) {
            return {
                type: 'retry_step',
                reason: `First retry attempt ${attempt}/2`
            };
        }

        // Use AI to determine strategy for complex failures
        if (this.agent.geminiService) {
            return await this.aiDeterminedStrategy(errorInfo);
        }

        // Fallback to rule-based strategy
        return this.ruleBasedStrategyDetermination(errorInfo);
    }

    /**
     * AI-powered recovery strategy determination
     */
    async aiDeterminedStrategy(errorInfo) {
        const { step, error, context, attempt } = errorInfo;
        
        try {
            const recentErrors = this.errorHistory.slice(-3);
            
            const prompt = `
RECOVERY STRATEGY DETERMINATION

Failed Step: "${step.description}"
Error: "${error}"
Attempt Number: ${attempt}
Current Context: ${JSON.stringify(context)}
Recent Error History: ${JSON.stringify(recentErrors)}

The web automation agent failed to complete this step. What's the best recovery strategy?

Available strategies:
1. retry_step - Try the same step again (good for temporary issues)
2. alternative_action - Try a different approach for the same goal
3. skip_step - Move to next step if this one isn't critical
4. reorient_agent - Agent is lost, needs to figure out where it is
5. ask_user_help - Request human intervention

Consider:
- How many times has this step failed?
- What type of error occurred?
- Are there patterns in recent failures?
- Is this a critical step or can it be skipped?

Respond with JSON:
{
    "strategy": "retry_step|alternative_action|skip_step|reorient_agent|ask_user_help",
    "reasoning": "detailed explanation of why this strategy was chosen",
    "confidence": 0.0-1.0,
    "alternative_approach": "if alternative_action, describe the new approach",
    "user_question": "if ask_user_help, what to ask the user"
}
            `;

            const response = await this.agent.geminiService.query(prompt);
            
            return {
                type: response.strategy,
                reasoning: response.reasoning,
                confidence: response.confidence,
                alternativeApproach: response.alternative_approach,
                userQuestion: response.user_question
            };
            
        } catch (aiError) {
            this.log(`AI strategy determination failed: ${aiError.message}`, 'warning');
            return this.ruleBasedStrategyDetermination(errorInfo);
        }
    }

    /**
     * Rule-based fallback strategy determination
     */
    ruleBasedStrategyDetermination(errorInfo) {
        const { error, attempt } = errorInfo;
        const errorLower = error.toLowerCase();

        // Element not found - try reorientation
        if (errorLower.includes('not found') || errorLower.includes('no such element')) {
            if (attempt <= 3) {
                return {
                    type: 'reorient_agent',
                    reason: 'Element not found, need to reorient'
                };
            } else {
                return {
                    type: 'ask_user_help',
                    reason: 'Repeatedly unable to find element, need human help'
                };
            }
        }

        // Timeout errors - retry or skip
        if (errorLower.includes('timeout')) {
            if (attempt <= 2) {
                return {
                    type: 'retry_step',
                    reason: 'Timeout error, worth retrying'
                };
            } else {
                return {
                    type: 'skip_step',
                    reason: 'Repeated timeouts, try skipping'
                };
            }
        }

        // Navigation errors - reorient
        if (errorLower.includes('navigation') || errorLower.includes('navigate')) {
            return {
                type: 'reorient_agent',
                reason: 'Navigation issue, need to reorient'
            };
        }

        // Permission or access errors - ask user
        if (errorLower.includes('permission') || errorLower.includes('access denied')) {
            return {
                type: 'ask_user_help',
                reason: 'Permission issue, need user intervention'
            };
        }

        // Default strategy based on attempt count
        if (attempt <= 2) {
            return {
                type: 'retry_step',
                reason: 'Default retry strategy'
            };
        } else if (attempt <= 4) {
            return {
                type: 'alternative_action',
                reason: 'Try alternative approach'
            };
        } else {
            return {
                type: 'ask_user_help',
                reason: 'Multiple failures, need human help'
            };
        }
    }

    /**
     * Execute the chosen recovery strategy
     */
    async executeRecoveryStrategy(strategy, errorInfo) {
        this.log(`Executing recovery strategy: ${strategy.type}`, 'info');
        
        switch (strategy.type) {
            case 'retry_step':
                return await this.retryStep(errorInfo, strategy);
                
            case 'alternative_action':
                return await this.tryAlternativeAction(errorInfo, strategy);
                
            case 'skip_step':
                return await this.skipStep(errorInfo, strategy);
                
            case 'reorient_agent':
                return await this.reorientAgent(errorInfo, strategy);
                
            case 'ask_user_help':
                return await this.askUserHelp(errorInfo, strategy);
                
            default:
                throw new Error(`Unknown recovery strategy: ${strategy.type}`);
        }
    }

    /**
     * Retry the same step
     */
    async retryStep(errorInfo, strategy) {
        this.log(`Retrying step: ${errorInfo.step.description}`, 'info');
        
        // Add small delay before retry
        await this.wait(2000);
        
        return {
            action: 'retry',
            message: `Retrying step: ${strategy.reasoning}`,
            delay: 2000
        };
    }

    /**
     * Try alternative approach for the same goal
     */
    async tryAlternativeAction(errorInfo, strategy) {
        this.log('Attempting alternative approach', 'info');
        
        if (strategy.alternativeApproach) {
            return {
                action: 'alternative',
                message: `Trying alternative approach: ${strategy.alternativeApproach}`,
                approach: strategy.alternativeApproach
            };
        }

        // Generate alternative approach if not provided
        return await this.generateAlternativeApproach(errorInfo);
    }

    /**
     * Skip current step and move to next
     */
    async skipStep(errorInfo, strategy) {
        this.log(`Skipping step: ${errorInfo.step.description}`, 'warning');
        
        return {
            action: 'skip',
            message: `Skipping step: ${strategy.reasoning}`,
            skippedStep: errorInfo.step
        };
    }

    /**
     * Reorient agent when it gets lost
     */
    async reorientAgent(errorInfo, strategy) {
        this.log('Attempting to reorient agent', 'info');
        
        try {
            // Get current page state
            const currentTitle = await this.agent.webAutomation.getPageTitle();
            const currentUrl = await this.getCurrentUrl();
            const currentElements = await this.agent.domAnalyzer.analyzeCurrentPage();
            
            // Use AI to determine how to get back on track
            const reorientation = await this.agent.geminiService.reorient(
                this.agent.originalGoal,
                errorInfo.step.description,
                currentTitle,
                currentElements.interactive_elements.slice(0, 10), // Limit elements for AI
                this.agent.context
            );
            
            return {
                action: 'reorient',
                message: 'Agent reoriented successfully',
                reorientation: reorientation,
                currentState: {
                    title: currentTitle,
                    url: currentUrl,
                    elementCount: currentElements.total_elements
                }
            };
            
        } catch (reorientError) {
            this.log(`Reorientation failed: ${reorientError.message}`, 'error');
            
            return {
                action: 'reorient_failed',
                message: 'Could not reorient agent, escalating to user',
                error: reorientError.message
            };
        }
    }

    /**
     * Ask user for help
     */
    async askUserHelp(errorInfo, strategy) {
        this.log('Requesting user assistance', 'warning');
        
        const userQuestion = strategy.userQuestion || this.generateUserQuestion(errorInfo);
        
        return {
            action: 'ask_user',
            message: 'Need user assistance to continue',
            question: userQuestion,
            context: {
                failedStep: errorInfo.step.description,
                error: errorInfo.error,
                attemptCount: errorInfo.attempt
            }
        };
    }

    /**
     * Generate alternative approach using AI
     */
    async generateAlternativeApproach(errorInfo) {
        if (!this.agent.geminiService) {
            return {
                action: 'alternative',
                message: 'Trying generic alternative approach',
                approach: 'Look for different selectors or interaction methods'
            };
        }

        try {
            const currentElements = await this.agent.domAnalyzer.analyzeCurrentPage();
            
            const prompt = `
GENERATE ALTERNATIVE APPROACH

Failed Step: "${errorInfo.step.description}"
Original Goal: "${errorInfo.step.goal}"
Error: "${errorInfo.error}"
Available Elements: ${JSON.stringify(currentElements.interactive_elements.slice(0, 15))}

The original approach failed. What alternative approach should the agent try?
Consider different selectors, interaction methods, or sequences of actions.

Respond with JSON:
{
    "alternative_action": {
        "type": "action_type",
        "parameters": {...}
    },
    "reasoning": "why this alternative should work better"
}
            `;

            const response = await this.agent.geminiService.query(prompt);
            
            return {
                action: 'alternative',
                message: `Trying alternative approach: ${response.reasoning}`,
                approach: response.alternative_action,
                reasoning: response.reasoning
            };
            
        } catch (error) {
            return {
                action: 'alternative',
                message: 'Generated generic alternative approach',
                approach: 'Try different element selection strategy'
            };
        }
    }

    /**
     * Generate user question for help
     */
    generateUserQuestion(errorInfo) {
        const { step, error, attempt } = errorInfo;
        
        return `I'm having trouble with this step: "${step.description}". 
        
Error: ${error}
Attempts: ${attempt}

Can you help me understand:
1. Is this step still necessary for the goal?
2. Should I try a different approach?
3. Are there any specific details I should know about this page?

Please provide guidance on how to proceed.`;
    }

    /**
     * Get current URL
     */
    async getCurrentUrl() {
        try {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                return tab?.url || 'unknown';
            }
            return 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Get attempt count for a step
     */
    getAttemptCount(stepId) {
        return this.errorHistory.filter(err => 
            err.step.step_id === stepId
        ).length + 1;
    }

    /**
     * Check if error is recoverable
     */
    isRecoverableError(error) {
        const unrecoverablePatterns = [
            'network error',
            'connection refused',
            'invalid credentials',
            'access forbidden'
        ];
        
        const errorLower = error.message.toLowerCase();
        return !unrecoverablePatterns.some(pattern => 
            errorLower.includes(pattern)
        );
    }

    /**
     * Reset error history for new task
     */
    resetErrorHistory() {
        this.errorHistory = [];
        this.log('Error history reset for new task', 'info');
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const stats = {
            totalErrors: this.errorHistory.length,
            errorsByType: {},
            errorsByStep: {},
            recentErrors: this.errorHistory.slice(-5)
        };

        this.errorHistory.forEach(error => {
            // Count by error type
            const errorType = this.categorizeError(error.error);
            stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
            
            // Count by step
            const stepId = error.step.step_id;
            stats.errorsByStep[stepId] = (stats.errorsByStep[stepId] || 0) + 1;
        });

        return stats;
    }

    /**
     * Categorize error for statistics
     */
    categorizeError(errorMessage) {
        const errorLower = errorMessage.toLowerCase();
        
        if (errorLower.includes('not found') || errorLower.includes('no such element')) {
            return 'element_not_found';
        }
        if (errorLower.includes('timeout')) {
            return 'timeout';
        }
        if (errorLower.includes('navigation')) {
            return 'navigation';
        }
        if (errorLower.includes('permission') || errorLower.includes('access')) {
            return 'permission';
        }
        if (errorLower.includes('network')) {
            return 'network';
        }
        
        return 'other';
    }

    /**
     * Logging utility
     */
    log(message, level = 'info') {
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '🔄';
        console.log(`${prefix} [ErrorHandler] ${message}`);
        
        // Send to agent log
        if (this.agent && this.agent.log) {
            this.agent.log(`[ErrorHandler] ${message}`, level);
        }
    }

    /**
     * Utility method to add delay
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}