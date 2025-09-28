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
        this.viewport = { width: 1200, height: 800 };
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

        // Try to get page data with retry logic for content script connection
        const maxRetries = 3;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // First, try to ensure content script is injected
                if (attempt > 1) {
                    console.log(`DOM analyzer: Retrying page data request, attempt ${attempt}`);
                    await this.ensureContentScriptInjected(tab);
                }
                
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: 'GET_PAGE_DATA'
                });
                
                if (response && response.success !== false) {
                    return response;
                }
                
                throw new Error(response?.error || 'Invalid response from content script');
                
            } catch (error) {
                lastError = error;
                console.warn(`DOM analyzer attempt ${attempt} failed:`, error.message);
                
                // If this is a connection error, try to re-inject content script
                if (error.message.includes('Could not establish connection') || 
                    error.message.includes('Receiving end does not exist')) {
                    
                    if (attempt < maxRetries) {
                        console.log('Attempting to re-inject content script...');
                        await this.ensureContentScriptInjected(tab);
                        await this.wait(1000); // Wait for injection
                        continue;
                    }
                }
                
                // For other errors, don't retry
                if (attempt === maxRetries) {
                    break;
                }
            }
        }
        
        throw new Error(`Failed to get page data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
    }
    
    /**
     * Ensure content script is injected in the tab
     */
    async ensureContentScriptInjected(tab) {
        try {
            // Try to inject the content script files
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['web-automation.js', 'content-script.js']
            });
            
            // Also inject CSS if needed
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['content-styles.css']
            });
            
        } catch (error) {
            console.warn('Failed to inject content script:', error.message);
            // Don't throw here, as script might already be injected
        }
    }
    
    /**
     * Wait utility
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract interactive elements from page data
     */
    extractInteractiveElements(pageData) {
        this.viewport = pageData.viewport || { width: 1200, height: 800 };

        const elements = [];
        let idCounter = 1;

        const interactiveElements = Array.isArray(pageData.interactiveElements)
            ? pageData.interactiveElements
            : [];

        // Process each interactive element
        interactiveElements.forEach(element => {
            // For elements that might be wrappers, try to find actual input inside
            const actualElement = this.findActualInteractiveElement(element);
            
            const processedElement = {
                agent_id: this.generateAgentId(actualElement, idCounter++),
                element_type: actualElement.tagName.toLowerCase(),
                description: this.generateDescription(actualElement),
                selector: this.generateSelector(actualElement),
                text_content: this.cleanText(actualElement.textContent || actualElement.value || ''),
                attributes: this.extractRelevantAttributes(actualElement),
                location: this.describeLocation(actualElement),
                isVisible: actualElement.isVisible,
                boundingRect: actualElement.boundingRect,
                isActualInput: this.isActualInputElement(actualElement)
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
        // Special handling for video elements to indicate position
        const isVideo = this.isVideoElement(element);
        
        // Try to use meaningful identifiers
        if (element.id) {
            const baseId = `id_${element.id}`;
            return isVideo ? `${baseId}_video_${counter}` : baseId;
        }
        if (element.name) {
            const baseId = `name_${element.name}`;
            return isVideo ? `${baseId}_video_${counter}` : baseId;
        }

        const placeholder = element.placeholder || element.attributes?.placeholder;
        if (placeholder) {
            const cleanPlaceholder = this.cleanText(placeholder).toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 25);
            if (cleanPlaceholder) {
                const baseId = `placeholder_${cleanPlaceholder}`;
                return isVideo ? `${baseId}_video_${counter}` : baseId;
            }
        }

        const ariaLabel = element.attributes?.['aria-label'];
        if (ariaLabel) {
            const cleanAria = this.cleanText(ariaLabel).toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 25);
            if (cleanAria) {
                const baseId = `aria_${cleanAria}`;
                return isVideo ? `${baseId}_video_${counter}` : baseId;
            }
        }
        
        // Use text content for buttons/links
        const text = this.cleanText(element.textContent || element.value || '');
        if (text && text.length <= 30) {
            const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
            const baseId = `${element.tagName.toLowerCase()}_${cleanText}`;
            return isVideo ? `${baseId}_video_${counter}` : baseId;
        }
        
        // Use type for inputs
        if (element.type) {
            const baseId = `${element.tagName.toLowerCase()}_${element.type}_${counter}`;
            return isVideo ? `${baseId}_video` : baseId;
        }
        
        // Fallback to element type and counter
        const baseId = `${element.tagName.toLowerCase()}_${counter}`;
        return isVideo ? `${baseId}_video` : baseId;
    }
    
    /**
     * Check if element is a video-related element
     */
    isVideoElement(element) {
        const href = element.href || '';
        const className = element.className || '';
        const id = element.id || '';
        const textContent = element.textContent || '';
        
        return (
            href.includes('/watch') ||
            href.includes('video') ||
            className.includes('video') ||
            className.includes('ytd-video') ||
            className.includes('watch') ||
            id.includes('video') ||
            textContent.toLowerCase().includes('video')
        );
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

        // Use placeholder when available (common for search inputs)
        const placeholder = element.placeholder || element.attributes?.placeholder;
        if (placeholder) {
            const escaped = placeholder.replace(/"/g, '\\"');
            selectors.push(`${element.tagName.toLowerCase()}[placeholder="${escaped}"]`);
        }

        // Use aria-label when available
        const ariaLabel = element.attributes?.['aria-label'];
        if (ariaLabel) {
            const escaped = ariaLabel.replace(/"/g, '\\"');
            selectors.push(`${element.tagName.toLowerCase()}[aria-label="${escaped}"]`);
        }

        // Include type-based selector for inputs
        if (element.type) {
            selectors.push(`${element.tagName.toLowerCase()}[type="${element.type}"]`);
        }
        
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
        const viewportHeight = this.viewport?.height || 800;
        const viewportWidth = this.viewport?.width || 1200;
        
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
        if (!text) {
            return '';
        }

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
    
    /**
     * Try to find the actual interactive element (in case current element is a wrapper)
     */
    findActualInteractiveElement(element) {
        // If this is already a good input element, return as is
        if (this.isActualInputElement(element)) {
            return element;
        }
        
        // Note: Since we're working with serialized data, we can't traverse DOM here
        // The content script improvements will handle this logic
        return element;
    }
    
    /**
     * Check if element is an actual input element (not a wrapper)
     */
    isActualInputElement(element) {
        const tag = element.tagName?.toLowerCase();
        
        // Direct input elements
        if (tag === 'input' || tag === 'textarea') {
            return true;
        }
        
        // Content editable elements
        if (element.attributes?.contenteditable === 'true') {
            return true;
        }
        
        // Elements with role textbox
        if (element.attributes?.role === 'textbox') {
            return true;
        }
        
        return false;
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMAnalyzer;
}