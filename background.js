// Import agent classes for service worker
// Service workers can't use ES modules, so we import them directly
importScripts('config.js', 'gemini-service.js', 'dom-analyzer.js', 'web-automation.js', 'error-handler.js', 'user-interaction.js', 'web-agent.js');

class AutonomousWebAssistantBackground {
    constructor() {
        this.webAgent = null;
        this.geminiApiKey = null; // Will be set from options
        this.apiKeySource = 'unset';
        this.setupMessageListeners();
        this.setupSidePanel();
        this.initializeAgent();
        console.log('Autonomous Web Assistant background script loaded');
    }

    async initializeAgent() {
        // Try to get API key from storage
        try {
            const hardcodedKey = this.getHardcodedApiKey();
            if (hardcodedKey) {
                this.geminiApiKey = hardcodedKey;
                this.apiKeySource = 'hardcoded';
                await this.createAgent();
                return;
            }

            const result = await chrome.storage.sync.get(['geminiApiKey']);
            if (result.geminiApiKey) {
                this.geminiApiKey = result.geminiApiKey;
                this.apiKeySource = 'stored';
                await this.createAgent();
            } else {
                console.log('Gemini API key not found. Agent will be created when key is provided.');
            }
        } catch (error) {
            console.error('Error loading API key:', error);
        }
    }

    getHardcodedApiKey() {
        try {
            const key = self?.EXTENSION_CONFIG?.geminiApiKey;
            if (typeof key === 'string' && key.trim() && key !== 'YOUR_GEMINI_API_KEY_HERE') {
                return key.trim();
            }
        } catch (error) {
            console.warn('Unable to read hardcoded Gemini API key:', error);
        }
        return null;
    }

    async createAgent() {
        if (!this.geminiApiKey) {
            throw new Error('Gemini API key is required');
        }

        try {
            // Import agent classes (in extension context, these are loaded globally)
            this.webAgent = new AutonomousWebAgent(this.geminiApiKey, {
                maxRetries: 3,
                timeout: 10000
            });
            
            console.log('Autonomous Web Agent initialized successfully');
        } catch (error) {
            console.error('Failed to create web agent:', error);
            throw error;
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'PROCESS_COMMAND') {
                this.processUserRequest(message.command)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ 
                        success: false, 
                        error: error.message 
                    }));
                return true; // Will respond asynchronously
            } else if (message.type === 'CONTENT_LOG') {
                // Forward content script logs to sidebar
                this.forwardToSidebar(message);
            } else if (message.type === 'OPEN_SIDEBAR') {
                // Handle sidebar open request from popup
                this.openSidebar(sender.tab?.windowId);
            } else if (message.type === 'SET_API_KEY') {
                // Handle API key setup
                this.setApiKey(message.apiKey)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ 
                        success: false, 
                        error: error.message 
                    }));
                return true;
            } else if (message.type === 'GET_AGENT_STATUS') {
                sendResponse({
                    success: true,
                    hasApiKey: Boolean(this.geminiApiKey),
                    source: this.apiKeySource
                });
            } else if (message.type === 'USER_RESPONSE') {
                // Forward user responses to agent
                this.handleUserResponse(message);
            } else if (message.type === 'AGENT_LOG') {
                // Forward agent logs to sidebar
                this.forwardToSidebar({
                    type: 'CONTENT_LOG',
                    message: message.message,
                    level: message.level,
                    timestamp: message.timestamp
                });
            } else if (message.type === 'STOP_AGENT') {
                // Stop current agent execution
                this.stopAgent();
                sendResponse({ success: true });
            }
        });
    }

    async openSidebar(windowId) {
        try {
            if (windowId) {
                await chrome.sidePanel.open({ windowId });
            } else {
                // Get current window if not provided
                const currentWindow = await chrome.windows.getCurrent();
                await chrome.sidePanel.open({ windowId: currentWindow.id });
            }
        } catch (error) {
            console.error('Error opening sidebar:', error);
        }
    }

    setupSidePanel() {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }

    async processUserRequest(userRequest) {
        console.log('Processing user request:', userRequest);
        
        if (!this.webAgent) {
            return {
                success: false,
                error: 'Agent not initialized. Please set your Gemini API key first.',
                needsApiKey: true
            };
        }
        
        try {
            // Use the autonomous agent to process the request
            const result = await this.webAgent.processUserRequest(userRequest);
            
            return {
                success: true,
                result: result,
                aiResponse: result.response || result.message || 'Task in progress...'
            };
            
        } catch (error) {
            console.error('Error processing request:', error);
            return {
                success: false,
                error: error.message,
                aiResponse: "I'm sorry, I encountered an error processing your request. Please try again."
            };
        }
    }

    async setApiKey(apiKey) {
        try {
            // Validate API key format (basic check)
            if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
                throw new Error('Invalid API key format');
            }

            // Store API key
            await chrome.storage.sync.set({ geminiApiKey: apiKey });
            this.geminiApiKey = apiKey;
            this.apiKeySource = 'stored';
            
            // Create new agent with the API key
            await this.createAgent();
            
            return {
                success: true,
                message: 'API key set successfully. Agent is now ready!'
            };
            
        } catch (error) {
            console.error('Error setting API key:', error);
            throw error;
        }
    }

    handleUserResponse(message) {
        if (this.webAgent && this.webAgent.userInteraction) {
            this.webAgent.userInteraction.handleUserResponse(message);
        }
    }

    stopAgent() {
        if (this.webAgent) {
            this.webAgent.stop();
            console.log('Agent execution stopped');
        }
    }

    forwardToSidebar(message) {
        // Forward messages to the sidebar if it's open
        chrome.runtime.sendMessage({
            type: 'ACTION_COMPLETED',
            description: message.message,
            level: message.level,
            timestamp: message.timestamp
        }, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError && !lastError.message?.includes('Receiving end does not exist')) {
                console.warn('Could not forward to sidebar:', lastError.message);
            }
        });
    }
}

// Initialize the background service
new AutonomousWebAssistantBackground();