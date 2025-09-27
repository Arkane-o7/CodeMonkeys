class VoiceAssistantBackground {
    constructor() {
        this.aiService = null;
        this.autonomousAgent = null;
        this.setupMessageListeners();
        this.setupSidePanel();
        this.initializeAI();
        console.log('Enhanced Voice Assistant background script loaded');
    }

    async initializeAI() {
        try {
            // Import AI service (we'll need to load it differently in a real extension)
            // For now, we'll instantiate it here
            this.aiService = {
                isInitialized: () => false,
                setApiKey: async (key) => false,
                // Placeholder methods
                generateHighLevelPlan: async () => { throw new Error('AI Service not configured'); },
                analyzePageStructure: async () => { throw new Error('AI Service not configured'); },
                decideNextAction: async () => { throw new Error('AI Service not configured'); },
                verifyActionOutcome: async () => { throw new Error('AI Service not configured'); },
                handleErrorRecovery: async () => { throw new Error('AI Service not configured'); }
            };
            
            // Initialize autonomous agent with placeholder
            this.autonomousAgent = {
                processUserGoal: async () => { throw new Error('AI Service not configured'); },
                isActive: () => false,
                stop: () => {},
                getCurrentProgress: () => ({ currentStep: 0, totalSteps: 0, isRunning: false })
            };
            
            console.log('AI service initialized (placeholder mode)');
        } catch (error) {
            console.error('Failed to initialize AI service:', error);
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'PROCESS_COMMAND') {
                this.processVoiceCommand(message.command)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ 
                        success: false, 
                        error: error.message 
                    }));
                return true; // Will respond asynchronously
            } else if (message.type === 'PROCESS_AUTONOMOUS_GOAL') {
                this.processAutonomousGoal(message.goal)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ 
                        success: false, 
                        error: error.message 
                    }));
                return true; // Will respond asynchronously
            } else if (message.type === 'CONFIGURE_AI') {
                this.configureAI(message.apiKey)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ 
                        success: false, 
                        error: error.message 
                    }));
                return true; // Will respond asynchronously
            } else if (message.type === 'GET_AI_STATUS') {
                sendResponse({
                    success: true,
                    aiInitialized: this.aiService?.isInitialized() || false,
                    agentActive: this.autonomousAgent?.isActive() || false,
                    agentProgress: this.autonomousAgent?.getCurrentProgress() || null
                });
            } else if (message.type === 'STOP_AUTONOMOUS_AGENT') {
                this.autonomousAgent?.stop();
                sendResponse({ success: true, message: 'Autonomous agent stopped' });
            } else if (message.type === 'CONTENT_LOG') {
                // Forward content script logs to sidebar
                this.forwardToSidebar(message);
            } else if (message.type === 'OPEN_SIDEBAR') {
                // Handle sidebar open request from popup
                this.openSidebar(sender.tab?.windowId);
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

    async processVoiceCommand(command) {
        console.log('Processing voice command:', command);
        
        try {
            // Parse the command and determine action
            const action = await this.parseCommand(command);
            const aiResponse = this.generateResponse(command, action);
            
            return {
                success: true,
                aiResponse: aiResponse,
                action: action
            };
        } catch (error) {
            console.error('Error processing command:', error);
            return {
                success: false,
                error: error.message,
                aiResponse: "I'm sorry, I couldn't understand that command. Please try again."
            };
        }
    }

    async parseCommand(command) {
        const lowerCommand = command.toLowerCase();
        
        // Navigation commands
        if (lowerCommand.includes('go to') || lowerCommand.includes('navigate to') || lowerCommand.includes('open')) {
            const url = this.extractUrl(command);
            return {
                type: 'navigate',
                url: url
            };
        }
        
        // Search commands
        if (lowerCommand.includes('search for') || lowerCommand.includes('find') || lowerCommand.includes('look for')) {
            const query = this.extractSearchQuery(command);
            return {
                type: 'search',
                query: query
            };
        }
        
        // Click commands
        if (lowerCommand.includes('click') || lowerCommand.includes('press') || lowerCommand.includes('select')) {
            const text = this.extractClickTarget(command);
            return {
                type: 'click',
                text: text,
                selector: null
            };
        }
        
        // Type commands
        if (lowerCommand.includes('type') || lowerCommand.includes('enter') || lowerCommand.includes('input')) {
            const text = this.extractTypeText(command);
            return {
                type: 'type',
                text: text,
                selector: null
            };
        }
        
        // Scroll commands
        if (lowerCommand.includes('scroll')) {
            const direction = lowerCommand.includes('up') ? 'up' : 'down';
            return {
                type: 'scroll',
                direction: direction,
                amount: 300
            };
        }
        
        // Default fallback
        throw new Error('Command not recognized');
    }

    extractUrl(command) {
        const lowerCommand = command.toLowerCase();
        
        // Common website patterns
        const siteMap = {
            'google': 'https://www.google.com',
            'amazon': 'https://www.amazon.com',
            'youtube': 'https://www.youtube.com',
            'facebook': 'https://www.facebook.com',
            'twitter': 'https://www.twitter.com',
            'github': 'https://www.github.com',
            'stackoverflow': 'https://stackoverflow.com',
            'reddit': 'https://www.reddit.com',
            'wikipedia': 'https://www.wikipedia.org',
            'news': 'https://news.google.com',
            'gmail': 'https://mail.google.com',
            'bank': 'https://www.chase.com', // Example bank
            'weather': 'https://weather.com'
        };
        
        // Extract site name from command
        for (const [keyword, url] of Object.entries(siteMap)) {
            if (lowerCommand.includes(keyword)) {
                return url;
            }
        }
        
        // Look for URLs in the command
        const urlMatch = command.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            return urlMatch[0];
        }
        
        // Default to Google search if unclear
        const searchTerm = command.replace(/(go to|navigate to|open)/gi, '').trim();
        return `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
    }

    extractSearchQuery(command) {
        // Remove search command words and extract the query
        const query = command
            .replace(/(search for|find|look for|search)/gi, '')
            .trim();
        
        return query || 'search query';
    }

    extractClickTarget(command) {
        // Remove click command words and extract the target
        const target = command
            .replace(/(click|press|select|click on|press on)/gi, '')
            .trim();
        
        return target || 'button';
    }

    extractTypeText(command) {
        // Extract text to type
        const text = command
            .replace(/(type|enter|input)/gi, '')
            .trim();
        
        return text || '';
    }

    generateResponse(command, action) {
        const responses = {
            navigate: `I'll navigate to ${action.url} for you.`,
            search: `I'll search for "${action.query}" on this page.`,
            click: `I'll click on "${action.text}" for you.`,
            type: `I'll type "${action.text}" in the input field.`,
            scroll: `I'll scroll ${action.direction} on the page.`
        };
        
        return responses[action.type] || "I'll execute that action for you.";
    }

    async forwardToSidebar(message) {
        // Forward messages to the sidebar if it's open
        try {
            await chrome.runtime.sendMessage({
                type: 'ACTION_COMPLETED',
                description: message.message,
                timestamp: message.timestamp
            });
        } catch (error) {
            // Sidebar might not be open, ignore the error
            console.log('Could not forward to sidebar:', error.message);
        }
    }

    // Process autonomous goal using AI agent
    async processAutonomousGoal(goal) {
        console.log('Processing autonomous goal:', goal);
        
        try {
            if (!this.aiService?.isInitialized()) {
                return {
                    success: false,
                    error: 'AI Service not configured. Please set up your Gemini API key first.',
                    requiresConfiguration: true
                };
            }

            // Use autonomous agent to process the goal
            const result = await this.autonomousAgent.processUserGoal(goal);
            
            return {
                success: true,
                result: result,
                aiResponse: `I'll help you achieve: "${goal}". Let me break this down into steps and execute them.`
            };
            
        } catch (error) {
            console.error('Error processing autonomous goal:', error);
            return {
                success: false,
                error: error.message,
                aiResponse: `I encountered an error while trying to achieve your goal: ${error.message}`
            };
        }
    }

    // Configure AI service with API key
    async configureAI(apiKey) {
        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

            // In a real implementation, we'd load the actual AI service here
            console.log('AI configuration requested (placeholder mode)');
            
            return {
                success: false,
                error: 'AI Service configuration is not yet implemented. This is a demo version.',
                message: 'To enable full autonomous AI capabilities, please implement the Gemini API integration.'
            };
            
        } catch (error) {
            console.error('Error configuring AI:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Initialize the background service
new VoiceAssistantBackground();