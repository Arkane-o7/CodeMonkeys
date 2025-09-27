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
}

// Initialize the controller when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new WebPageController());
} else {
    new WebPageController();
}