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
        
        this.log(`Executing action: ${type}`, parameters);
        
        try {
            switch (type.toLowerCase()) {
                case 'goto':
                    return await this.goto(parameters.url);
                    
                case 'click':
                    return await this.click(parameters.selector);
                    
                case 'type':
                    return await this.type(parameters.selector, parameters.value);
                    
                case 'select':
                    return await this.select(parameters.selector, parameters.value);
                    
                case 'scroll':
                    return await this.scroll(parameters.direction, parameters.amount);
                    
                case 'hover':
                    return await this.hover(parameters.selector);
                    
                case 'wait_for_element':
                    return await this.waitForElement(parameters.selector, parameters.condition);
                    
                case 'handle_popup':
                    return await this.handlePopup(parameters.action);
                    
                case 'get_text':
                    return await this.getText(parameters.selector);
                    
                case 'get_attribute':
                    return await this.getAttribute(parameters.selector, parameters.attribute);
                    
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
    async goto(url) {
        this.log(`Navigating to: ${url}`);
        
        if (!url) {
            throw new Error('URL is required for goto action');
        }
        
        // Ensure URL has protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        try {
            await this.executeInTab({
                type: 'NAVIGATE',
                url: url
            });
            
            // Wait for page to load
            await this.waitForPageLoad();
            
            return {
                success: true,
                message: `Successfully navigated to ${url}`,
                url: url
            };
        } catch (error) {
            throw new Error(`Failed to navigate to ${url}: ${error.message}`);
        }
    }

    /**
     * Click element
     */
    async click(selector) {
        this.log(`Clicking element: ${selector}`);
        
        if (!selector) {
            throw new Error('Selector is required for click action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'CLICK',
                selector: selector
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Click action failed');
            }
            
            // Small delay after click
            await this.wait(500);
            
            return {
                success: true,
                message: `Successfully clicked ${selector}`,
                selector: selector
            };
        } catch (error) {
            throw new Error(`Failed to click ${selector}: ${error.message}`);
        }
    }

    /**
     * Type text into element
     */
    async type(selector, text) {
        this.log(`Typing into ${selector}: ${text}`);
        
        if (!selector || text === undefined) {
            throw new Error('Selector and text are required for type action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'TYPE',
                selector: selector,
                text: String(text)
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Type action failed');
            }
            
            return {
                success: true,
                message: `Successfully typed into ${selector}`,
                selector: selector,
                text: text
            };
        } catch (error) {
            throw new Error(`Failed to type into ${selector}: ${error.message}`);
        }
    }

    /**
     * Select option from dropdown
     */
    async select(selector, value) {
        this.log(`Selecting from ${selector}: ${value}`);
        
        if (!selector || value === undefined) {
            throw new Error('Selector and value are required for select action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'SELECT',
                selector: selector,
                value: String(value)
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Select action failed');
            }
            
            return {
                success: true,
                message: `Successfully selected ${value} from ${selector}`,
                selector: selector,
                value: value
            };
        } catch (error) {
            throw new Error(`Failed to select from ${selector}: ${error.message}`);
        }
    }

    /**
     * Scroll page
     */
    async scroll(direction = 'down', amount = 300) {
        this.log(`Scrolling ${direction} by ${amount}px`);
        
        try {
            const result = await this.executeInTab({
                type: 'SCROLL',
                direction: direction,
                amount: Number(amount)
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
                amount: amount
            };
        } catch (error) {
            throw new Error(`Failed to scroll: ${error.message}`);
        }
    }

    /**
     * Hover over element
     */
    async hover(selector) {
        this.log(`Hovering over: ${selector}`);
        
        if (!selector) {
            throw new Error('Selector is required for hover action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'HOVER',
                selector: selector
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
    async waitForElement(selector, condition = 'visible', timeout = null) {
        this.log(`Waiting for element ${selector} to be ${condition}`);
        
        if (!selector) {
            throw new Error('Selector is required for wait_for_element action');
        }
        
        const waitTimeout = timeout || this.timeout;
        
        try {
            const result = await this.executeInTab({
                type: 'WAIT_FOR_ELEMENT',
                selector: selector,
                condition: condition,
                timeout: waitTimeout
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
    async handlePopup(action = 'accept') {
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
    async getText(selector) {
        this.log(`Getting text from: ${selector}`);
        
        if (!selector) {
            throw new Error('Selector is required for get_text action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'GET_TEXT',
                selector: selector
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
    async getAttribute(selector, attribute) {
        this.log(`Getting ${attribute} attribute from: ${selector}`);
        
        if (!selector || !attribute) {
            throw new Error('Selector and attribute are required for get_attribute action');
        }
        
        try {
            const result = await this.executeInTab({
                type: 'GET_ATTRIBUTE',
                selector: selector,
                attribute: attribute
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
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebAutomation;
}