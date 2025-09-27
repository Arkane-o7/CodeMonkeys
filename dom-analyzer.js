/**
 * DOM Analyzer - Extracts interactive elements from web pages
 */

class DOMAnalyzer {
    constructor() {
        this.interactiveSelectors = [
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            '[contenteditable="true"]',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
            '[onclick]',
            '.btn',
            '.button',
            '.link'
        ];
    }

    /**
     * Analyze current page DOM and extract interactive elements
     */
    async analyzeCurrentPage() {
        try {
            // Get page HTML via content script
            const pageData = await this.getPageData();
            return this.extractInteractiveElements(pageData);
        } catch (error) {
            console.error('Error analyzing page:', error);
            throw error;
        }
    }

    /**
     * Get page data through content script
     */
    async getPageData() {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            throw new Error('Chrome extension context not available');
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            throw new Error('No active tab found');
        }

        return await chrome.tabs.sendMessage(tab.id, {
            type: 'GET_PAGE_DATA'
        });
    }

    /**
     * Extract interactive elements from page data
     */
    extractInteractiveElements(pageData) {
        const elements = [];
        let idCounter = 1;

        // Process each interactive element
        pageData.interactiveElements.forEach(element => {
            const processedElement = {
                agent_id: this.generateAgentId(element, idCounter++),
                element_type: element.tagName.toLowerCase(),
                description: this.generateDescription(element),
                selector: this.generateSelector(element),
                text_content: this.cleanText(element.textContent || element.value || ''),
                attributes: this.extractRelevantAttributes(element),
                location: this.describeLocation(element),
                isVisible: element.isVisible,
                boundingRect: element.boundingRect
            };

            elements.push(processedElement);
        });

        return {
            interactive_elements: elements,
            page_summary: this.generatePageSummary(pageData),
            page_title: pageData.title,
            page_url: pageData.url,
            total_elements: elements.length,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Generate unique agent ID for element
     */
    generateAgentId(element, counter) {
        // Try to use meaningful identifiers
        if (element.id) {
            return `id_${element.id}`;
        }
        if (element.name) {
            return `name_${element.name}`;
        }
        
        // Use text content for buttons/links
        const text = this.cleanText(element.textContent || element.value || '');
        if (text && text.length <= 30) {
            const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
            return `${element.tagName.toLowerCase()}_${cleanText}`;
        }
        
        // Use type for inputs
        if (element.type) {
            return `${element.tagName.toLowerCase()}_${element.type}_${counter}`;
        }
        
        // Fallback to element type and counter
        return `${element.tagName.toLowerCase()}_${counter}`;
    }

    /**
     * Generate human-readable description
     */
    generateDescription(element) {
        const tag = element.tagName.toLowerCase();
        const type = element.type;
        const text = this.cleanText(element.textContent || element.value || element.placeholder || '');
        
        switch (tag) {
            case 'button':
                return `Button: ${text || 'Unlabeled button'}`;
            case 'a':
                return `Link: ${text || element.href || 'Unlabeled link'}`;
            case 'input':
                switch (type) {
                    case 'text':
                    case 'email':
                    case 'password':
                    case 'search':
                        return `${this.capitalize(type)} input field${text ? `: ${text}` : ''}`;
                    case 'submit':
                        return `Submit button${text ? `: ${text}` : ''}`;
                    case 'checkbox':
                        return `Checkbox${text ? `: ${text}` : ''}`;
                    case 'radio':
                        return `Radio button${text ? `: ${text}` : ''}`;
                    default:
                        return `Input (${type})${text ? `: ${text}` : ''}`;
                }
            case 'textarea':
                return `Text area${text ? `: ${text}` : ''}`;
            case 'select':
                return `Dropdown${text ? `: ${text}` : ''}`;
            default:
                return `${this.capitalize(tag)}${text ? `: ${text}` : ''}`;
        }
    }

    /**
     * Generate CSS selector for element
     */
    generateSelector(element) {
        const selectors = [];
        
        // Prefer ID
        if (element.id) {
            selectors.push(`#${element.id}`);
        }
        
        // Use name attribute
        if (element.name) {
            selectors.push(`[name="${element.name}"]`);
        }
        
        // Use data attributes
        Object.keys(element.attributes || {}).forEach(attr => {
            if (attr.startsWith('data-') && element.attributes[attr]) {
                selectors.push(`[${attr}="${element.attributes[attr]}"]`);
            }
        });
        
        // Use class for buttons/interactive elements
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
                selectors.push(`.${classes.join('.')}`);
            }
        }
        
        // Fallback to xpath if available
        if (element.xpath) {
            selectors.push(element.xpath);
        }
        
        return selectors[0] || element.tagName.toLowerCase();
    }

    /**
     * Extract relevant attributes
     */
    extractRelevantAttributes(element) {
        const relevantAttrs = ['id', 'class', 'name', 'type', 'placeholder', 'value', 'href', 'title', 'role', 'aria-label'];
        const attributes = {};
        
        relevantAttrs.forEach(attr => {
            if (element.attributes && element.attributes[attr]) {
                attributes[attr] = element.attributes[attr];
            }
        });
        
        return attributes;
    }

    /**
     * Describe element location
     */
    describeLocation(element) {
        if (!element.boundingRect) {
            return 'Position unknown';
        }
        
        const rect = element.boundingRect;
        const viewportHeight = window.innerHeight || 800;
        const viewportWidth = window.innerWidth || 1200;
        
        let vertical = 'middle';
        if (rect.top < viewportHeight * 0.33) {
            vertical = 'top';
        } else if (rect.top > viewportHeight * 0.66) {
            vertical = 'bottom';
        }
        
        let horizontal = 'center';
        if (rect.left < viewportWidth * 0.33) {
            horizontal = 'left';
        } else if (rect.left > viewportWidth * 0.66) {
            horizontal = 'right';
        }
        
        return `${vertical} ${horizontal} of page`;
    }

    /**
     * Generate page summary
     */
    generatePageSummary(pageData) {
        const forms = pageData.interactiveElements.filter(el => el.tagName === 'FORM').length;
        const buttons = pageData.interactiveElements.filter(el => el.tagName === 'BUTTON' || el.type === 'submit').length;
        const inputs = pageData.interactiveElements.filter(el => el.tagName === 'INPUT').length;
        const links = pageData.interactiveElements.filter(el => el.tagName === 'A').length;
        
        let summary = `Page: ${pageData.title || 'Untitled'}`;
        
        if (forms > 0) summary += `, ${forms} form(s)`;
        if (buttons > 0) summary += `, ${buttons} button(s)`;
        if (inputs > 0) summary += `, ${inputs} input(s)`;
        if (links > 0) summary += `, ${links} link(s)`;
        
        return summary;
    }

    /**
     * Utility methods
     */
    cleanText(text) {
        return text.trim().replace(/\s+/g, ' ').substring(0, 100);
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Filter elements based on visibility and relevance
     */
    filterElements(elements, options = {}) {
        return elements.filter(element => {
            // Skip hidden elements unless explicitly included
            if (!options.includeHidden && !element.isVisible) {
                return false;
            }
            
            // Skip elements with no text or meaningful attributes
            if (!element.text_content && !element.attributes.placeholder && !element.attributes.value) {
                // Keep if it's a structural element like submit button
                if (element.element_type === 'input' && element.attributes.type === 'submit') {
                    return true;
                }
                // Keep if it has meaningful classes
                if (element.attributes.class && 
                    ['btn', 'button', 'submit', 'search'].some(cls => element.attributes.class.includes(cls))) {
                    return true;
                }
                return false;
            }
            
            return true;
        });
    }

    /**
     * Group elements by type for better organization
     */
    groupElementsByType(elements) {
        const groups = {
            navigation: [],
            forms: [],
            buttons: [],
            inputs: [],
            content: []
        };
        
        elements.forEach(element => {
            switch (element.element_type) {
                case 'a':
                    groups.navigation.push(element);
                    break;
                case 'form':
                    groups.forms.push(element);
                    break;
                case 'button':
                    groups.buttons.push(element);
                    break;
                case 'input':
                case 'textarea':
                case 'select':
                    groups.inputs.push(element);
                    break;
                default:
                    groups.content.push(element);
            }
        });
        
        return groups;
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMAnalyzer;
}