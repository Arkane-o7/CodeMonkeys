/**
 * Web Automation Engine - Executes actions on web pages
 */

class WebAutomation {
    constructor(options = {}) {
        this.timeout = options.timeout || 10000;
        this.retryDelay = options.retryDelay || 1000;
        this.maxRetries = options.maxRetries || 3;
        this.waitConditions = {
            visible: 'visible',
            hidden: 'hidden',
            enabled: 'enabled',
            clickable: 'clickable'
        };
    }

    /**
     * Execute an action based on action object
     */
    async executeAction(action) {
        const { type, parameters } = action;
        const params = parameters || {};
        
    this.log(`Executing action: ${type} ${JSON.stringify(params)}`);
        
        try {
            switch (type.toLowerCase()) {
                case 'goto':
                    return await this.goto(params);
                    
                case 'click':
                    return await this.click(params);
                    
                case 'type':
                    return await this.type(params);
                    
                case 'search':
                    return await this.search(params);
                    
                case 'select':
                    return await this.select(params);
                    
                case 'scroll':
                    return await this.scroll(params);
                    
                case 'hover':
                    return await this.hover(params);
                    
                case 'wait_for_element':
                    return await this.waitForElement(params);
                    
                case 'handle_popup':
                    return await this.handlePopup(params);
                    
                case 'get_text':
                    return await this.getText(params);
                    
                case 'get_attribute':
                    return await this.getAttribute(params);
                    
                case 'take_screenshot':
                    return await this.takeScreenshot();
                    
                default:
                    throw new Error(`Unknown action type: ${type}`);
            }
        } catch (error) {
            this.log(`Action failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Navigate to URL
     */
    async goto(params) {
        const rawUrl = typeof params === 'string' ? params : params?.url;
        this.log(`Navigating to: ${rawUrl}`);
        
        if (!rawUrl) {
            throw new Error('URL is required for goto action');
        }

        let url = rawUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('No active tab available for navigation');
            }

            await chrome.tabs.update(tab.id, { url });

            // Give the new page a moment to load and inject the content script
            await this.wait(500);
            await this.waitForPageLoad();
            
            // Ensure content script is ready after navigation
            await this.ensureContentScriptReady(tab.id);

            return {
                success: true,
                message: `Successfully navigated to ${url}`,
                url: url
            };
        } catch (tabError) {
            this.log(`Primary navigation failed via chrome.tabs.update: ${tabError.message}`, 'warning');

            try {
                await this.executeInTab({
                    type: 'NAVIGATE',
                    url: url
                });

                await this.waitForPageLoad();

                return {
                    success: true,
                    message: `Successfully navigated to ${url}`,
                    url: url
                };
            } catch (fallbackError) {
                throw new Error(`Failed to navigate to ${url}: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Click element
     */
    async click(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
        const command = {
            type: 'CLICK',
            selector,
            agentId: params.agent_id || params.agentId,
            text: params.text || params.label || params.description
        };
        
    this.log(`Clicking element ${command.selector || command.text || 'target'}`);
        
        if (!command.selector && !command.text) {
            throw new Error('Selector or descriptive text is required for click action');
        }
        
        try {
            const result = await this.executeInTab(command);
            
            if (!result.success) {
                throw new Error(result.error || 'Click action failed');
            }
            
            // Small delay after click
            await this.wait(500);
            
            // For video clicks, wait longer for page transition
            if (this.isVideoClick(command)) {
                this.log('Video element clicked, waiting for page transition...');
                await this.wait(2000);
            }
            
            return {
                success: true,
                message: `Successfully clicked ${command.selector || command.text}`,
                selector: command.selector || null
            };
        } catch (error) {
            const descriptor = command.selector || command.text || 'target';
            throw new Error(`Failed to click ${descriptor}: ${error.message}`);
        }
    }

    /**
     * Type text into element
     */
    async type(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
        const text = params.value ?? params.text ?? '';
        const command = {
            type: 'TYPE',
            selector,
            agentId: params.agent_id || params.agentId,
            text: String(text),
            append: Boolean(params.append)
        };
        
    this.log(`Typing into ${command.selector || 'target'} with text length ${command.text.length}`);
        
        if (!command.selector && !command.agentId) {
            throw new Error('Selector or agent identifier is required for type action');
        }
        
        try {
            const result = await this.executeInTab(command);
            
            if (!result.success) {
                throw new Error(result.error || 'Type action failed');
            }
            
            return {
                success: true,
                message: `Successfully typed into ${command.selector || 'target'}`,
                selector: command.selector || null,
                text: text
            };
        } catch (error) {
            const descriptor = command.selector || 'target';
            throw new Error(`Failed to type into ${descriptor}: ${error.message}`);
        }
    }

    /**
     * Search (type + submit)
     */
    async search(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
        const query = params.value ?? params.text ?? params.query ?? '';
        const command = {
            type: 'SEARCH',
            selector,
            agentId: params.agent_id || params.agentId,
            text: String(query)
        };
        
        this.log(`Searching for "${query}" in ${command.selector || 'target'}`);
        
        if (!command.selector && !command.agentId) {
            throw new Error('Selector or agent identifier is required for search action');
        }
        
        try {
            const result = await this.executeInTab(command);
            
            if (!result.success) {
                throw new Error(result.error || 'Search action failed');
            }
            
            return {
                success: true,
                message: `Successfully searched for "${query}"`,
                selector: command.selector || null,
                query: query
            };
        } catch (error) {
            const descriptor = command.selector || 'target';
            throw new Error(`Failed to search in ${descriptor}: ${error.message}`);
        }
    }

    /**
     * Select option from dropdown
     */
    async select(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
        const value = params.value ?? params.option ?? params.text;
        const command = {
            type: 'SELECT',
            selector,
            agentId: params.agent_id || params.agentId,
            value: value !== undefined ? String(value) : undefined,
            optionText: params.optionText || params.text
        };
        
    this.log(`Selecting option on ${command.selector}`);
        
        if (!command.selector) {
            throw new Error('Selector is required for select action');
        }
        
        if (command.value === undefined && !command.optionText) {
            throw new Error('Value or option text is required for select action');
        }
        
        try {
            const result = await this.executeInTab(command);
            
            if (!result.success) {
                throw new Error(result.error || 'Select action failed');
            }
            
            return {
                success: true,
                message: `Successfully selected option in ${command.selector}`,
                selector: command.selector,
                value: result.value ?? command.value
            };
        } catch (error) {
            throw new Error(`Failed to select from ${command.selector}: ${error.message}`);
        }
    }

    /**
     * Scroll page
     */
    async scroll(params = {}) {
        const direction = params.direction || 'down';
        const amount = Number(params.amount ?? 300);
        const selector = params.selector || params.agent_id || params.agentId;
        const block = params.block || 'center';
        
    this.log(`Scrolling ${direction} by ${amount}px${selector ? ' toward ' + selector : ''}`);
        
        try {
            const result = await this.executeInTab({
                type: 'SCROLL',
                direction: direction,
                amount: amount,
                selector: selector,
                block: block
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Scroll action failed');
            }
            
            // Wait for scroll to complete
            await this.wait(300);
            
            return {
                success: true,
                message: `Successfully scrolled ${direction}`,
                direction: direction,
                amount: amount,
                selector: selector || null
            };
        } catch (error) {
            throw new Error(`Failed to scroll: ${error.message}`);
        }
    }

    /**
     * Hover over element
     */
    async hover(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
    this.log(`Hovering over ${selector}`);
        
        if (!selector) {
            throw new Error('Selector is required for hover action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'HOVER',
                selector: selector,
                agentId: params.agent_id || params.agentId
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Hover action failed');
            }
            
            return {
                success: true,
                message: `Successfully hovered over ${selector}`,
                selector: selector
            };
        } catch (error) {
            throw new Error(`Failed to hover over ${selector}: ${error.message}`);
        }
    }

    /**
     * Wait for element to meet condition
     */
    async waitForElement(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
        const condition = params.condition || 'visible';
        const waitTimeout = params.timeout || params.waitTimeout || this.timeout;
        
    this.log(`Waiting for ${selector} to be ${condition} (timeout ${waitTimeout}ms)`);
        
        if (!selector) {
            throw new Error('Selector is required for wait_for_element action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'WAIT_FOR_ELEMENT',
                selector: selector,
                condition: condition,
                timeout: waitTimeout,
                agentId: params.agent_id || params.agentId
            });
            
            if (!result.success) {
                throw new Error(result.error || `Element ${selector} did not become ${condition} within ${waitTimeout}ms`);
            }
            
            return {
                success: true,
                message: `Element ${selector} is now ${condition}`,
                selector: selector,
                condition: condition
            };
        } catch (error) {
            throw new Error(`Failed to wait for element ${selector}: ${error.message}`);
        }
    }

    /**
     * Handle popup/modal
     */
    async handlePopup(params = {}) {
        const action = params.action || 'dismiss';
        this.log(`Handling popup with action: ${action}`);
        
        try {
            const result = await this.executeInTab({
                type: 'HANDLE_POPUP',
                action: action
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Handle popup action failed');
            }
            
            return {
                success: true,
                message: `Successfully handled popup with action: ${action}`,
                action: action
            };
        } catch (error) {
            throw new Error(`Failed to handle popup: ${error.message}`);
        }
    }

    /**
     * Get text content of element
     */
    async getText(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
    this.log(`Getting text from ${selector}`);
        
        if (!selector) {
            throw new Error('Selector is required for get_text action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'GET_TEXT',
                selector: selector,
                agentId: params.agent_id || params.agentId
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Get text action failed');
            }
            
            return {
                success: true,
                message: `Successfully retrieved text from ${selector}`,
                text: result.text,
                selector: selector
            };
        } catch (error) {
            throw new Error(`Failed to get text from ${selector}: ${error.message}`);
        }
    }

    /**
     * Get attribute value of element
     */
    async getAttribute(params = {}) {
        const selector = params.selector || params.agent_id || params.agentId;
        const attribute = params.attribute;
    this.log(`Getting attribute ${attribute} from ${selector}`);
        
        if (!selector || !attribute) {
            throw new Error('Selector and attribute are required for get_attribute action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'GET_ATTRIBUTE',
                selector: selector,
                attribute: attribute,
                agentId: params.agent_id || params.agentId
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Get attribute action failed');
            }
            
            return {
                success: true,
                message: `Successfully retrieved ${attribute} from ${selector}`,
                value: result.value,
                selector: selector,
                attribute: attribute
            };
        } catch (error) {
            throw new Error(`Failed to get attribute ${attribute} from ${selector}: ${error.message}`);
        }
    }

    /**
     * Take screenshot
     */
    async takeScreenshot() {
        this.log('Taking screenshot');
        
        try {
            if (typeof chrome === 'undefined' || !chrome.tabs) {
                throw new Error('Chrome extension context not available');
            }
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('No active tab found');
            }
            
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            
            return {
                success: true,
                message: 'Screenshot taken successfully',
                dataUrl: dataUrl
            };
        } catch (error) {
            throw new Error(`Failed to take screenshot: ${error.message}`);
        }
    }

    /**
     * Get current page HTML
     */
    async getCurrentPageHTML() {
        try {
            const result = await this.executeInTab({
                type: 'GET_HTML'
            });
            
            return result.html || '';
        } catch (error) {
            this.log(`Failed to get page HTML: ${error.message}`, 'error');
            return '';
        }
    }

    async getActiveTabUrl() {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            throw new Error('Chrome extension context not available');
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab?.url || '';
    }

    /**
     * Get page title
     */
    async getPageTitle() {
        try {
            const result = await this.executeInTab({
                type: 'GET_TITLE'
            });
            
            return result.title || '';
        } catch (error) {
            this.log(`Failed to get page title: ${error.message}`, 'error');
            return '';
        }
    }

    /**
     * Wait for page to load
     */
    async waitForPageLoad(timeout = 10000) {
        this.log('Waiting for page to load...');
        
        try {
            const result = await this.executeInTab({
                type: 'WAIT_FOR_LOAD',
                timeout: timeout
            });
            
            return result.success;
        } catch (error) {
            this.log(`Page load wait failed: ${error.message}`, 'warning');
            return false;
        }
    }

    /**
     * Execute command in active tab via content script
     */
    async executeInTab(command, retries = this.maxRetries) {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            throw new Error('Chrome extension context not available');
        }
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    throw new Error('No active tab found');
                }
                
                const response = await chrome.tabs.sendMessage(tab.id, command);
                
                if (response && response.success) {
                    return response;
                } else {
                    throw new Error(response?.error || 'Command execution failed');
                }
                
            } catch (error) {
                this.log(`Attempt ${attempt} failed: ${error.message}`, 'warning');
                
                if (attempt === retries) {
                    throw error;
                }
                
                // Wait before retry
                await this.wait(this.retryDelay);
            }
        }
    }

    /**
     * Utility method to add delay
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logging utility
     */
    log(message, level = 'info') {
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '🔧';
        console.log(`${prefix} [WebAutomation] ${message}`);
    }

    /**
     * Validate selector format
     */
    isValidSelector(selector) {
        if (!selector || typeof selector !== 'string') {
            return false;
        }
        
        // Basic validation for common selector types
        const patterns = [
            /^#[\w-]+$/,           // ID: #myId
            /^\.[\w-]+$/,          // Class: .myClass
            /^\w+$/,               // Tag: div
            /^\[[\w-]+(=.+)?\]$/,  // Attribute: [name="value"]
            /^\/\/.+$/             // XPath: //div[@id="test"]
        ];
        
        return patterns.some(pattern => pattern.test(selector.trim()));
    }

    /**
     * Get selector recommendations for common elements
     */
    getSelectorRecommendations(elementType) {
        const recommendations = {
            button: ['button', '[type="submit"]', '.btn', '.button'],
            input: ['input[type="text"]', 'input[type="email"]', 'input[type="password"]'],
            link: ['a[href]', '.link'],
            form: ['form', '.form'],
            search: ['input[type="search"]', '[placeholder*="search"]', '.search'],
            login: ['[type="password"]', '[name*="password"]', '.login'],
            submit: ['[type="submit"]', 'button[type="submit"]', '.submit']
        };
        
        return recommendations[elementType] || [];
    }
    
    /**
     * Ensure content script is ready in the specified tab
     */
    async ensureContentScriptReady(tabId, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Test if content script is responsive
                const response = await chrome.tabs.sendMessage(tabId, {
                    type: 'GET_TITLE'
                });
                
                if (response && response.success !== false) {
                    this.log('Content script is ready');
                    return true;
                }
            } catch (error) {
                this.log(`Content script test attempt ${attempt} failed: ${error.message}`, 'warning');
                
                // Try to inject content script if connection failed
                if (error.message.includes('Could not establish connection') || 
                    error.message.includes('Receiving end does not exist')) {
                    
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId },
                            files: ['web-automation.js', 'content-script.js']
                        });
                        
                        await chrome.scripting.insertCSS({
                            target: { tabId },
                            files: ['content-styles.css']
                        });
                        
                        this.log('Re-injected content script');
                        
                        // Wait for initialization
                        await this.wait(1000);
                        
                    } catch (injectError) {
                        this.log(`Failed to inject content script: ${injectError.message}`, 'warning');
                    }
                }
            }
            
            if (attempt < maxRetries) {
                await this.wait(500);
            }
        }
        
        this.log('Content script may not be ready, proceeding anyway', 'warning');
        return false;
    }
    
    /**
     * Check if this is a video element click
     */
    isVideoClick(command) {
        if (!command.selector && !command.text) return false;
        
        const selector = (command.selector || '').toLowerCase();
        const text = (command.text || '').toLowerCase();
        
        // Video-related selectors/text patterns
        const videoPatterns = [
            'video-title',
            'watch',
            'play',
            'thumbnail',
            selector.includes('video'),
            text.includes('video'),
            text.includes('play'),
            // YouTube specific
            selector.includes('ytd-video-renderer'),
            selector.includes('yt-simple-endpoint')
        ];
        
        return videoPatterns.some(pattern => pattern);
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebAutomation;
}