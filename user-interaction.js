/**
 * User Interaction Handler - Manages communication with users
 */

class UserInteraction {
    constructor(options = {}) {
        this.timeout = options.timeout || 60000; // 1 minute default timeout for user responses
        this.pendingRequests = new Map();
        this.responseCallbacks = new Map();
        this.setupMessageListener();
    }

    /**
     * Request input from user for sensitive information
     */
    async requestInput(decision) {
        const inputRequest = this.analyzeInputRequirements(decision);
        
        if (inputRequest.required.length === 0) {
            return {}; // No input required
        }

        this.log(`Requesting user input: ${inputRequest.required.join(', ')}`);
        
        return await this.promptUser({
            type: 'input_request',
            title: 'User Input Required',
            message: this.generateInputMessage(inputRequest),
            fields: inputRequest.fields,
            timeout: this.timeout
        });
    }

    /**
     * Ask user for help or clarification
     */
    async askForHelp(question, context = {}) {
        this.log('Asking user for help');
        
        return await this.promptUser({
            type: 'help_request',
            title: 'Need Your Help',
            message: question,
            context: context,
            timeout: this.timeout
        });
    }

    /**
     * Ask user for confirmation before proceeding
     */
    async requestConfirmation(action, implications) {
        this.log(`Requesting confirmation for: ${action}`);
        
        return await this.promptUser({
            type: 'confirmation',
            title: 'Confirm Action',
            message: `I'm about to: ${action}\n\nThis may result in: ${implications}\n\nShould I proceed?`,
            options: ['Yes', 'No', 'Skip this step'],
            timeout: this.timeout
        });
    }

    /**
     * Present multiple options to user
     */
    async presentOptions(title, message, options) {
        this.log(`Presenting options to user: ${title}`);
        
        return await this.promptUser({
            type: 'multiple_choice',
            title: title,
            message: message,
            options: options,
            timeout: this.timeout
        });
    }

    /**
     * Show status update to user
     */
    async showStatus(message, type = 'info') {
        this.log(`Status update: ${message}`);
        
        // Send status to chat interface
        this.sendToChat({
            type: 'status_update',
            message: message,
            level: type,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Show progress update
     */
    async showProgress(current, total, description) {
        const percentage = Math.round((current / total) * 100);
        const message = `${description} (${current}/${total} - ${percentage}%)`;
        
        this.sendToChat({
            type: 'progress_update',
            current: current,
            total: total,
            percentage: percentage,
            description: description,
            message: message
        });
    }

    /**
     * Core user prompting method
     */
    async promptUser(request) {
        const requestId = this.generateRequestId();
        request.requestId = requestId;
        
        return new Promise((resolve, reject) => {
            // Store the callback
            this.responseCallbacks.set(requestId, { resolve, reject });
            
            // Send request to user interface
            this.sendToChat({
                type: 'user_prompt',
                ...request
            });
            
            // Set timeout
            const timeoutId = setTimeout(() => {
                this.responseCallbacks.delete(requestId);
                reject(new Error(`User response timeout after ${request.timeout}ms`));
            }, request.timeout);
            
            // Store timeout reference for cleanup
            this.pendingRequests.set(requestId, timeoutId);
        });
    }

    /**
     * Handle user response
     */
    handleUserResponse(response) {
        const { requestId, ...responseData } = response;
        
        if (!requestId || !this.responseCallbacks.has(requestId)) {
            this.log(`Received response for unknown request: ${requestId}`, 'warning');
            return;
        }
        
        // Clear timeout
        const timeoutId = this.pendingRequests.get(requestId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.pendingRequests.delete(requestId);
        }
        
        // Resolve the promise
        const { resolve } = this.responseCallbacks.get(requestId);
        this.responseCallbacks.delete(requestId);
        
        this.log(`Received user response for request: ${requestId}`);
        resolve(responseData);
    }

    /**
     * Analyze what input is required from decision
     */
    analyzeInputRequirements(decision) {
        const action = decision.action;
        const required = [];
        const fields = [];
        
        // Check for sensitive data requirements
        const sensitivePatterns = {
            username: ['username', 'user', 'login', 'email'],
            password: ['password', 'pass', 'pwd'],
            email: ['email', 'e-mail'],
            phone: ['phone', 'tel', 'mobile'],
            address: ['address', 'location'],
            creditcard: ['credit', 'card', 'payment'],
            name: ['name', 'firstname', 'lastname']
        };
        
        const actionStr = JSON.stringify(action).toLowerCase();
        
        Object.entries(sensitivePatterns).forEach(([type, patterns]) => {
            if (patterns.some(pattern => actionStr.includes(pattern))) {
                required.push(type);
                fields.push(this.createFieldDefinition(type));
            }
        });
        
        // Check for specific parameter requirements
        if (action.parameters) {
            if (action.parameters.value === undefined && action.type === 'type') {
                // Text input without value
                required.push('text_input');
                fields.push({
                    name: 'text_input',
                    label: 'Text to enter',
                    type: 'text',
                    required: true,
                    description: 'Enter the text you want to type'
                });
            }
            
            if (action.parameters.value === 'SELECT_OPTION' && action.type === 'select') {
                // Dropdown selection without specified option
                required.push('option_choice');
                fields.push({
                    name: 'option_choice',
                    label: 'Option to select',
                    type: 'text',
                    required: true,
                    description: 'Enter the option you want to select from the dropdown'
                });
            }
        }
        
        return { required, fields };
    }

    /**
     * Create field definition for user input
     */
    createFieldDefinition(type) {
        const definitions = {
            username: {
                name: 'username',
                label: 'Username',
                type: 'text',
                required: true,
                description: 'Enter your username or email'
            },
            password: {
                name: 'password',
                label: 'Password',
                type: 'password',
                required: true,
                description: 'Enter your password'
            },
            email: {
                name: 'email',
                label: 'Email',
                type: 'email',
                required: true,
                description: 'Enter your email address'
            },
            phone: {
                name: 'phone',
                label: 'Phone Number',
                type: 'tel',
                required: true,
                description: 'Enter your phone number'
            },
            address: {
                name: 'address',
                label: 'Address',
                type: 'text',
                required: true,
                description: 'Enter your address'
            },
            name: {
                name: 'name',
                label: 'Name',
                type: 'text',
                required: true,
                description: 'Enter your full name'
            }
        };
        
        return definitions[type] || {
            name: type,
            label: type.charAt(0).toUpperCase() + type.slice(1),
            type: 'text',
            required: true,
            description: `Enter your ${type}`
        };
    }

    /**
     * Generate input request message
     */
    generateInputMessage(inputRequest) {
        const fieldNames = inputRequest.required.map(field => 
            field.charAt(0).toUpperCase() + field.slice(1)
        ).join(', ');
        
        return `I need the following information to continue:\n\n${fieldNames}\n\nThis information is required to complete the current step. Your data will only be used for this automation task.`;
    }

    /**
     * Send message to chat interface
     */
    sendToChat(message) {
        // Send via Chrome extension messaging
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'USER_INTERACTION',
                ...message
            }).catch(error => {
                this.log(`Failed to send message to chat: ${error.message}`, 'error');
            });
        }
        
        // Also log to console for debugging
        console.log('[UserInteraction]', message);
    }

    /**
     * Setup message listener for user responses
     */
    setupMessageListener() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'USER_RESPONSE') {
                    this.handleUserResponse(message);
                    sendResponse({ success: true });
                }
            });
        }
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Validate user input
     */
    validateInput(fields, responses) {
        const validation = {
            valid: true,
            errors: []
        };
        
        fields.forEach(field => {
            const value = responses[field.name];
            
            // Check required fields
            if (field.required && (!value || value.trim() === '')) {
                validation.valid = false;
                validation.errors.push(`${field.label} is required`);
                return;
            }
            
            // Type-specific validation
            if (value && value.trim() !== '') {
                switch (field.type) {
                    case 'email':
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(value)) {
                            validation.valid = false;
                            validation.errors.push(`${field.label} must be a valid email address`);
                        }
                        break;
                        
                    case 'password':
                        if (value.length < 6) {
                            validation.valid = false;
                            validation.errors.push(`${field.label} must be at least 6 characters long`);
                        }
                        break;
                        
                    case 'tel':
                        const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
                        if (!phoneRegex.test(value)) {
                            validation.valid = false;
                            validation.errors.push(`${field.label} must be a valid phone number`);
                        }
                        break;
                }
            }
        });
        
        return validation;
    }

    /**
     * Format error message for user
     */
    formatErrorMessage(error, context = {}) {
        let message = `❌ **Error Occurred**\n\n`;
        message += `**Details:** ${error.message}\n\n`;
        
        if (context.step) {
            message += `**Step:** ${context.step}\n\n`;
        }
        
        if (context.suggestion) {
            message += `**Suggestion:** ${context.suggestion}\n\n`;
        }
        
        message += `How would you like me to proceed?\n`;
        message += `• **Retry** - Try the same action again\n`;
        message += `• **Skip** - Skip this step and continue\n`;
        message += `• **Help** - Get more detailed assistance\n`;
        message += `• **Stop** - Stop the current task`;
        
        return message;
    }

    /**
     * Format success message
     */
    formatSuccessMessage(action, result) {
        return `✅ **Success!** ${action} completed successfully.${result ? `\n\n**Result:** ${result}` : ''}`;
    }

    /**
     * Clean up pending requests
     */
    cleanup() {
        // Clear all pending timeouts
        this.pendingRequests.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        
        // Reject all pending promises
        this.responseCallbacks.forEach(({ reject }) => {
            reject(new Error('User interaction handler cleanup'));
        });
        
        // Clear collections
        this.pendingRequests.clear();
        this.responseCallbacks.clear();
        
        this.log('User interaction handler cleaned up');
    }

    /**
     * Get pending request count
     */
    getPendingRequestCount() {
        return this.pendingRequests.size;
    }

    /**
     * Logging utility
     */
    log(message, level = 'info') {
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '💬';
        console.log(`${prefix} [UserInteraction] ${message}`);
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserInteraction;
}