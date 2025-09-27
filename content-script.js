class WebPageController {
    constructor() {
        this.highlightedElement = null;
        this.setupMessageListener();
        this.injectStyles();
        this.logAction('Content script loaded');
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'EXECUTE_ACTION') {
                this.executeAction(message.action)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true; // Will respond asynchronously
            } else if (message.type === 'EXECUTE_ENHANCED_ACTION') {
                this.executeEnhancedAction(message.action)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true; // Will respond asynchronously
            } else if (message.type === 'GET_PAGE_CONTENT') {
                this.getPageContent()
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true; // Will respond asynchronously
            } else if (message.type === 'ANALYZE_PAGE_ELEMENTS') {
                this.analyzePageElements()
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true; // Will respond asynchronously
            }
        });
    }

    injectStyles() {
        if (document.getElementById('voice-assistant-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'voice-assistant-styles';
        style.textContent = `
            .voice-assistant-highlight {
                outline: 3px solid #FF6B35 !important;
                outline-offset: 2px !important;
                background-color: rgba(255, 107, 53, 0.1) !important;
                transition: all 0.3s ease !important;
                animation: voiceAssistantPulse 2s infinite !important;
            }
            
            .voice-assistant-typing {
                background-color: rgba(76, 175, 80, 0.2) !important;
                transition: all 0.3s ease !important;
            }
            
            .voice-assistant-clicked {
                animation: voiceAssistantClick 0.5s ease-out !important;
            }
            
            .voice-assistant-error {
                outline: 3px solid #F44336 !important;
                background-color: rgba(244, 67, 54, 0.1) !important;
                animation: voiceAssistantError 1s ease-out !important;
            }
            
            @keyframes voiceAssistantPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            @keyframes voiceAssistantClick {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
            
            @keyframes voiceAssistantError {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
            
            .voice-assistant-loading-overlay {
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(255, 107, 53, 0.9);
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                animation: slideInRight 0.3s ease-out;
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
    }

    async executeAction(action) {
        this.showLoadingIndicator(`Executing: ${action.type}`);
        
        try {
            switch (action.type) {
                case 'navigate':
                    return await this.navigate(action.url);
                case 'click':
                    return await this.clickElement(action.selector, action.text);
                case 'type':
                    return await this.typeText(action.selector, action.text);
                case 'scroll':
                    return await this.scroll(action.direction, action.amount);
                case 'search':
                    return await this.search(action.query);
                default:
                    throw new Error(`Unknown action type: ${action.type}`);
            }
        } finally {
            this.hideLoadingIndicator();
        }
    }

    async navigate(url) {
        this.logAction(`Navigating to ${url}`);
        window.location.href = url;
        return { success: true, message: `Navigated to ${url}` };
    }

    async clickElement(selector, text) {
        let element;
        
        if (selector) {
            element = document.querySelector(selector);
        } else if (text) {
            element = this.findElementByText(text);
        }
        
        if (!element) {
            throw new Error(`Element not found: ${selector || text}`);
        }
        
        this.highlightElement(element);
        await this.sleep(1000); // Visual pause
        
        element.classList.add('voice-assistant-clicked');
        element.click();
        
        await this.sleep(500);
        this.removeHighlight();
        
        this.logAction(`Clicked element: ${element.tagName}`);
        return { success: true, message: 'Element clicked successfully' };
    }

    async typeText(selector, text) {
        const element = document.querySelector(selector) || 
                      document.activeElement ||
                      this.findInputElement();
        
        if (!element) {
            throw new Error('No input element found');
        }
        
        this.highlightElement(element);
        element.focus();
        
        // Clear existing text
        element.value = '';
        element.classList.add('voice-assistant-typing');
        
        // Type character by character for visual effect
        for (let i = 0; i < text.length; i++) {
            element.value += text[i];
            
            // Trigger input events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            await this.sleep(50); // Typing animation delay
        }
        
        element.classList.remove('voice-assistant-typing');
        this.removeHighlight();
        
        this.logAction(`Typed text: "${text}"`);
        return { success: true, message: 'Text typed successfully' };
    }

    async scroll(direction = 'down', amount = 300) {
        const scrollAmount = direction === 'up' ? -amount : amount;
        
        window.scrollBy({
            top: scrollAmount,
            behavior: 'smooth'
        });
        
        await this.sleep(1000);
        
        this.logAction(`Scrolled ${direction} by ${amount}px`);
        return { success: true, message: `Scrolled ${direction}` };
    }

    async search(query) {
        // Look for search input fields
        const searchSelectors = [
            'input[type="search"]',
            'input[name*="search"]',
            'input[placeholder*="search"]',
            'input[placeholder*="Search"]',
            '#search',
            '.search-input',
            'input[name="q"]'
        ];
        
        let searchInput = null;
        for (const selector of searchSelectors) {
            searchInput = document.querySelector(selector);
            if (searchInput) break;
        }
        
        if (!searchInput) {
            throw new Error('No search input found on this page');
        }
        
        await this.typeText(null, query);
        
        // Look for search button
        const searchButton = this.findSearchButton();
        if (searchButton) {
            await this.sleep(500);
            await this.clickElement(null, null);
        } else {
            // Press Enter if no button found
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }
        
        this.logAction(`Searched for: "${query}"`);
        return { success: true, message: `Searched for "${query}"` };
    }

    findElementByText(text) {
        const xpath = `//*[contains(text(), "${text}")]`;
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
    }

    findInputElement() {
        const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea');
        return inputs[0] || null;
    }

    findSearchButton() {
        const buttonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Search")',
            'button:contains("search")',
            '.search-button',
            '#search-button'
        ];
        
        for (const selector of buttonSelectors) {
            const button = document.querySelector(selector);
            if (button) return button;
        }
        
        return null;
    }

    highlightElement(element) {
        this.removeHighlight();
        this.highlightedElement = element;
        element.classList.add('voice-assistant-highlight');
        
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    removeHighlight() {
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('voice-assistant-highlight');
            this.highlightedElement.classList.remove('voice-assistant-typing');
            this.highlightedElement.classList.remove('voice-assistant-clicked');
            this.highlightedElement = null;
        }
    }

    showLoadingIndicator(message) {
        const existing = document.getElementById('voice-assistant-loading');
        if (existing) existing.remove();
        
        const loading = document.createElement('div');
        loading.id = 'voice-assistant-loading';
        loading.className = 'voice-assistant-loading-overlay';
        loading.textContent = message;
        
        document.body.appendChild(loading);
    }

    hideLoadingIndicator() {
        const loading = document.getElementById('voice-assistant-loading');
        if (loading) {
            loading.remove();
        }
    }

    logAction(message) {
        // Send log message to sidebar
        chrome.runtime.sendMessage({
            type: 'CONTENT_LOG',
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Enhanced action execution for autonomous agent
    async executeEnhancedAction(action) {
        this.showLoadingIndicator(`Executing: ${action.type}`);
        
        try {
            switch (action.type) {
                case 'goto':
                    return await this.navigate(action.parameters.url);
                case 'click':
                    return await this.clickElementEnhanced(action.parameters);
                case 'type':
                    return await this.typeTextEnhanced(action.parameters);
                case 'select':
                    return await this.selectOption(action.parameters);
                case 'scroll':
                    return await this.scrollEnhanced(action.parameters);
                case 'hover':
                    return await this.hoverElement(action.parameters);
                case 'wait_for_element':
                    return await this.waitForElement(action.parameters);
                case 'handle_popup':
                    return await this.handlePopup(action.parameters);
                case 'navigate':
                    return await this.navigate(action.parameters.url);
                default:
                    throw new Error(`Unknown enhanced action type: ${action.type}`);
            }
        } finally {
            this.hideLoadingIndicator();
        }
    }

    // Enhanced click with better element finding
    async clickElementEnhanced(parameters) {
        const { selector, text, xpath } = parameters;
        let element = null;

        // Try different methods to find the element
        if (selector) {
            element = document.querySelector(selector);
        } else if (xpath) {
            element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else if (text) {
            element = this.findElementByTextEnhanced(text);
        }

        if (!element) {
            throw new Error(`Element not found. Selector: ${selector}, Text: ${text}, XPath: ${xpath}`);
        }

        this.logAction(`Clicking element: ${element.tagName} ${element.textContent?.substring(0, 50) || ''}`);
        
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(500);

        // Highlight the element
        this.highlightElement(element);
        await this.sleep(1000);

        // Add click animation
        element.classList.add('voice-assistant-clicked');
        
        // Click the element
        element.click();
        
        await this.sleep(500);
        this.removeHighlight();

        return { 
            success: true, 
            message: `Clicked element: ${element.tagName}`,
            elementInfo: {
                tagName: element.tagName,
                text: element.textContent?.substring(0, 100),
                attributes: this.getElementAttributes(element)
            }
        };
    }

    // Enhanced text typing with better input field detection
    async typeTextEnhanced(parameters) {
        const { selector, text, xpath, clearFirst = true } = parameters;
        let element = null;

        // Try different methods to find input element
        if (selector) {
            element = document.querySelector(selector);
        } else if (xpath) {
            element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else {
            element = this.findInputElementEnhanced();
        }

        if (!element) {
            throw new Error(`Input element not found. Selector: ${selector}, XPath: ${xpath}`);
        }

        this.logAction(`Typing "${text}" into ${element.tagName}`);

        // Scroll element into view and focus
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(500);

        element.focus();
        this.highlightElement(element);
        
        if (clearFirst) {
            element.value = '';
        }

        element.classList.add('voice-assistant-typing');

        // Type character by character for more natural interaction
        for (const char of text) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await this.sleep(50); // Typing animation delay
        }

        // Trigger change event
        element.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(500);

        element.classList.remove('voice-assistant-typing');
        this.removeHighlight();

        return { 
            success: true, 
            message: `Typed "${text}" into input field`,
            elementInfo: {
                tagName: element.tagName,
                type: element.type,
                value: element.value
            }
        };
    }

    // Select option from dropdown
    async selectOption(parameters) {
        const { selector, value, text, xpath } = parameters;
        let element = null;

        if (selector) {
            element = document.querySelector(selector);
        } else if (xpath) {
            element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else {
            element = document.querySelector('select');
        }

        if (!element || element.tagName !== 'SELECT') {
            throw new Error(`Select element not found or invalid. Selector: ${selector}, XPath: ${xpath}`);
        }

        this.logAction(`Selecting option: ${value || text}`);

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(500);

        this.highlightElement(element);
        
        // Find the option to select
        let option = null;
        if (value) {
            option = element.querySelector(`option[value="${value}"]`);
        } else if (text) {
            const options = Array.from(element.options);
            option = options.find(opt => opt.textContent.includes(text));
        }

        if (!option) {
            throw new Error(`Option not found. Value: ${value}, Text: ${text}`);
        }

        option.selected = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        await this.sleep(500);
        this.removeHighlight();

        return { 
            success: true, 
            message: `Selected option: ${option.textContent}`,
            elementInfo: {
                selectedValue: element.value,
                selectedText: option.textContent
            }
        };
    }

    // Enhanced scrolling with better control
    async scrollEnhanced(parameters) {
        const { direction = 'down', amount = 300, element: elementSelector } = parameters;
        
        let targetElement = document.documentElement;
        if (elementSelector) {
            const el = document.querySelector(elementSelector);
            if (el) targetElement = el;
        }

        const scrollAmount = direction === 'up' ? -amount : amount;
        
        this.logAction(`Scrolling ${direction} by ${amount}px`);

        targetElement.scrollBy({
            top: scrollAmount,
            behavior: 'smooth'
        });

        await this.sleep(1000); // Wait for scroll to complete

        return { 
            success: true, 
            message: `Scrolled ${direction}`,
            scrollInfo: {
                direction,
                amount,
                newScrollPosition: targetElement.scrollTop
            }
        };
    }

    // Hover over element
    async hoverElement(parameters) {
        const { selector, text, xpath } = parameters;
        let element = null;

        if (selector) {
            element = document.querySelector(selector);
        } else if (xpath) {
            element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else if (text) {
            element = this.findElementByTextEnhanced(text);
        }

        if (!element) {
            throw new Error(`Element not found for hover. Selector: ${selector}, Text: ${text}, XPath: ${xpath}`);
        }

        this.logAction(`Hovering over element: ${element.tagName}`);

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(500);

        // Simulate hover
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        
        this.highlightElement(element);
        await this.sleep(2000); // Keep hover for 2 seconds
        
        element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        
        this.removeHighlight();

        return { 
            success: true, 
            message: `Hovered over element: ${element.tagName}`,
            elementInfo: {
                tagName: element.tagName,
                text: element.textContent?.substring(0, 100)
            }
        };
    }

    // Wait for element to appear
    async waitForElement(parameters) {
        const { selector, text, xpath, timeout = 10000 } = parameters;
        const startTime = Date.now();

        this.logAction(`Waiting for element: ${selector || text || xpath}`);

        return new Promise((resolve, reject) => {
            const checkElement = () => {
                let element = null;

                if (selector) {
                    element = document.querySelector(selector);
                } else if (xpath) {
                    element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                } else if (text) {
                    element = this.findElementByTextEnhanced(text);
                }

                if (element) {
                    resolve({ 
                        success: true, 
                        message: `Element found: ${element.tagName}`,
                        elementInfo: {
                            tagName: element.tagName,
                            text: element.textContent?.substring(0, 100)
                        }
                    });
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error(`Element not found within ${timeout}ms timeout`));
                } else {
                    setTimeout(checkElement, 100);
                }
            };

            checkElement();
        });
    }

    // Handle popup or dialog
    async handlePopup(parameters) {
        const { action = 'accept', text } = parameters;

        this.logAction(`Handling popup with action: ${action}`);

        // Check for JavaScript dialogs
        if (window.confirm || window.alert || window.prompt) {
            // Note: Modern browsers don't allow scripts to interact with native dialogs
            // This is a placeholder for custom popup handling
        }

        // Look for modal dialogs or overlays
        const modalSelectors = [
            '.modal', '[role="dialog"]', '.dialog', '.popup',
            '.overlay', '[aria-modal="true"]', '.modal-dialog'
        ];

        let modal = null;
        for (const selector of modalSelectors) {
            modal = document.querySelector(selector);
            if (modal && modal.offsetParent !== null) break; // Check if visible
        }

        if (modal) {
            if (action === 'accept' || action === 'ok') {
                // Look for accept/ok buttons
                const acceptButtons = modal.querySelectorAll(
                    'button, [role="button"], input[type="submit"], input[type="button"]'
                );
                const acceptButton = Array.from(acceptButtons).find(btn => 
                    /ok|accept|confirm|yes|continue/i.test(btn.textContent || btn.value)
                );
                
                if (acceptButton) {
                    acceptButton.click();
                    await this.sleep(500);
                }
            } else if (action === 'dismiss' || action === 'cancel') {
                // Look for close/cancel buttons
                const dismissButtons = modal.querySelectorAll(
                    'button, [role="button"], .close, [aria-label*="close"], [title*="close"]'
                );
                const dismissButton = Array.from(dismissButtons).find(btn => 
                    /close|cancel|dismiss|no|×/i.test(btn.textContent || btn.value || btn.title || btn.getAttribute('aria-label'))
                );
                
                if (dismissButton) {
                    dismissButton.click();
                    await this.sleep(500);
                }
            }
        }

        return { 
            success: true, 
            message: `Handled popup with action: ${action}`,
            popupFound: !!modal
        };
    }

    // Enhanced element finding by text
    findElementByTextEnhanced(text) {
        const xpath = `//*[contains(text(), "${text}") or contains(@value, "${text}") or contains(@placeholder, "${text}") or contains(@title, "${text}") or contains(@aria-label, "${text}")]`;
        const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        
        // Return the first visible element
        for (let i = 0; i < result.snapshotLength; i++) {
            const element = result.snapshotItem(i);
            if (element.offsetParent !== null) { // Check if visible
                return element;
            }
        }
        
        return null;
    }

    // Enhanced input element finding
    findInputElementEnhanced() {
        const inputSelectors = [
            'input[type="text"]:not([style*="display: none"]):not([hidden])',
            'input:not([type]):not([style*="display: none"]):not([hidden])',
            'input[type="email"]:not([style*="display: none"]):not([hidden])',
            'input[type="search"]:not([style*="display: none"]):not([hidden])',
            'input[type="url"]:not([style*="display: none"]):not([hidden])',
            'input[type="tel"]:not([style*="display: none"]):not([hidden])',
            'textarea:not([style*="display: none"]):not([hidden])',
            '[contenteditable="true"]:not([style*="display: none"]):not([hidden])'
        ];

        for (const selector of inputSelectors) {
            const elements = document.querySelectorAll(selector);
            const visibleElement = Array.from(elements).find(el => el.offsetParent !== null);
            if (visibleElement) return visibleElement;
        }

        return null;
    }

    // Get page content for AI analysis
    async getPageContent() {
        const result = {
            url: window.location.href,
            title: document.title,
            html: document.documentElement.outerHTML,
            text: document.body.innerText || document.body.textContent,
            timestamp: new Date().toISOString()
        };

        return result;
    }

    // Analyze page elements for AI
    async analyzePageElements() {
        const elements = [];
        
        // Find all interactive elements
        const selectors = [
            'a[href]', 'button', 'input', 'select', 'textarea',
            '[onclick]', '[role="button"]', '[role="link"]',
            '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]'
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((el, index) => {
                if (el.offsetParent !== null) { // Only visible elements
                    elements.push({
                        tagName: el.tagName.toLowerCase(),
                        type: el.type || null,
                        text: el.textContent?.trim().substring(0, 100) || '',
                        value: el.value || '',
                        href: el.href || null,
                        id: el.id || null,
                        className: el.className || '',
                        placeholder: el.placeholder || '',
                        title: el.title || '',
                        ariaLabel: el.getAttribute('aria-label') || '',
                        selector: this.generateSelector(el),
                        position: {
                            x: el.offsetLeft,
                            y: el.offsetTop,
                            width: el.offsetWidth,
                            height: el.offsetHeight
                        }
                    });
                }
            });
        });

        return {
            elements,
            totalElements: elements.length,
            pageInfo: {
                url: window.location.href,
                title: document.title,
                description: document.querySelector('meta[name="description"]')?.content || ''
            }
        };
    }

    // Generate CSS selector for element
    generateSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }
        
        let selector = element.tagName.toLowerCase();
        
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c).join('.');
            if (classes) selector += `.${classes}`;
        }
        
        // Add position-based selector if needed
        const parent = element.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(element);
            if (siblings.length > 1) {
                selector += `:nth-child(${index + 1})`;
            }
        }
        
        return selector;
    }

    // Get element attributes
    getElementAttributes(element) {
        const attributes = {};
        for (const attr of element.attributes) {
            attributes[attr.name] = attr.value;
        }
        return attributes;
    }
}

// Initialize the controller when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new WebPageController());
} else {
    new WebPageController();
}