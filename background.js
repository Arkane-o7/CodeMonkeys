class VoiceAssistantBackground {
    constructor() {
        this.setupMessageListeners();
        this.setupSidePanel();
        console.log('Voice Assistant background script loaded');
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
}

// Initialize the background service
new VoiceAssistantBackground();