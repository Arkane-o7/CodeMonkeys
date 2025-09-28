class AutonomousContentController {
    constructor() {
        this.highlightedElement = null;
        this.handlers = {
            NAVIGATE: this.handleNavigate,
            CLICK: this.handleClick,
            TYPE: this.handleType,
            SEARCH: this.handleSearch,
            SELECT: this.handleSelect,
            SCROLL: this.handleScroll,
            HOVER: this.handleHover,
            WAIT_FOR_ELEMENT: this.handleWaitForElement,
            HANDLE_POPUP: this.handleHandlePopup,
            GET_TEXT: this.handleGetText,
            GET_ATTRIBUTE: this.handleGetAttribute,
            GET_HTML: this.handleGetHtml,
            GET_TITLE: this.handleGetTitle,
            WAIT_FOR_LOAD: this.handleWaitForLoad,
            GET_PAGE_DATA: this.handleGetPageData
        };

        this.injectStyles();
        this.setupMessageListener();
        this.logAction('Autonomous content script initialized');
    }

    setupMessageListener() {
        if (!chrome || !chrome.runtime) {
            console.warn('Chrome runtime not available in content script context');
            return;
        }

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            const type = message?.type;
            const handler = type ? this.handlers[type] : null;

            if (!handler) {
                sendResponse({
                    success: false,
                    error: `Unknown command: ${type}`
                });
                return false;
            }

            Promise.resolve(handler.call(this, message))
                .then(result => {
                    sendResponse({ success: true, ...result });
                })
                .catch(error => {
                    console.error(`Handler error for ${type}:`, error);
                    sendResponse({ success: false, error: error.message });
                });

            return true; // keep message channel open for async response
        });
    }

    async handleNavigate(message) {
        const url = this.normalizeUrl(message.url);
        if (!url) {
            throw new Error('URL is required for navigation');
        }

        setTimeout(() => {
            window.location.href = url;
        }, 0);

        this.logAction(`Navigation triggered to ${url}`);
        return {
            message: `Navigation started to ${url}`,
            url
        };
    }

    async handleClick(message) {
        const element = this.locateElement(message);
        if (!element) {
            throw new Error(`Element not found for selector/agent/text: ${message.selector || message.agentId || message.text || 'unknown'}`);
        }

        this.highlightElement(element);
        await this.sleep(80);

        this.dispatchMouseEvents(element);

        setTimeout(() => this.removeHighlight(), 250);
        this.logAction(`Clicked ${this.describeElement(element)}`);

        return {
            message: `Clicked element ${this.describeElement(element)}`,
            selector: message.selector || null
        };
    }

    async handleType(message) {
        let element = this.locateElement(message);
        if (!element) {
            throw new Error(`Input element not found for selector/agent: ${message.selector || message.agentId || 'unknown'}`);
        }

        // If the located element is not typeable, try to find a nearby input
        if (!this.isTypeableElement(element)) {
            const nearbyInput = this.findNearbyInput(element);
            if (nearbyInput) {
                this.logAction(`Located element was not typeable, using nearby input: ${this.describeElement(nearbyInput)}`);
                element = nearbyInput;
            } else {
                // Try clicking the element first (might activate an input)
                try {
                    element.click();
                    await this.sleep(300);
                    
                    // Check if clicking revealed an input
                    const activeElement = document.activeElement;
                    if (activeElement && this.isTypeableElement(activeElement)) {
                        this.logAction(`Clicked element activated input field: ${this.describeElement(activeElement)}`);
                        element = activeElement;
                    }
                } catch (clickError) {
                    // Ignore click errors, continue with original validation
                }
                
                if (!this.isTypeableElement(element)) {
                    throw new Error(`Target element cannot accept text input. Element type: ${element.tagName.toLowerCase()}, contentEditable: ${element.isContentEditable}, has value property: ${'value' in element}`);
                }
            }
        }

        const text = String(message.text ?? message.value ?? '');
        const append = Boolean(message.append);

        this.highlightElement(element);
        element.classList.add('voice-assistant-typing');
        element.focus({ preventScroll: false });

        if (!append) {
            if (element.isContentEditable) {
                element.textContent = '';
            } else if ('value' in element) {
                element.value = '';
            }
        }

        if (element.isContentEditable) {
            element.textContent = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        } else if ('value' in element) {
            for (const char of text) {
                element.value += char;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(10);
            }
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            throw new Error('Target element cannot accept text input after fallback attempts');
        }

        // Auto-submit search if this looks like a search input
        if (this.isSearchField(element)) {
            this.logAction('🚀 Auto-submitting search (detected search field)');
            
            // Try multiple Enter key events for better compatibility
            await this.submitSearch(element);
            
            // Wait a bit then try to find and click search button as fallback
            await this.sleep(300);
            const searchButton = this.findNearbySearchButton(element);
            if (searchButton && this.isVisible(searchButton)) {
                this.logAction('🔍 Also clicking nearby search button as fallback');
                searchButton.click();
                await this.sleep(200);
            }
        } else {
            console.log('⚠️ Not detected as search field, skipping auto-submit for:', element.tagName, element.className, element.name, element.id);
        }

        setTimeout(() => this.removeHighlight(), 200);
        this.logAction(`Typed into ${this.describeElement(element)}: "${text}"`);

        return {
            message: `Typed ${text.length} characters`,
            text
        };
    }
    
    /**
     * Submit search with multiple methods for better compatibility
     */
    async submitSearch(element) {
        // Method 1: KeyboardEvent for keydown
        element.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));
        
        // Method 2: KeyboardEvent for keypress (some sites need this)
        element.dispatchEvent(new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));
        
        // Method 3: KeyboardEvent for keyup
        element.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));
        
        // Method 4: Try submitting the form directly
        const form = element.closest('form');
        if (form) {
            console.log('📝 Also trying form.submit()');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        
        console.log('⌨️ Dispatched Enter key events to submit search');
    }
    
    /**
     * Handle search action (type + submit)
     */
    async handleSearch(message) {
        // First type the text
        const typeResult = await this.handleType(message);
        
        // Then ensure search submission
        const element = this.locateElement(message);
        if (element) {
            await this.sleep(300);
            
            // Try Enter key
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            });
            element.dispatchEvent(enterEvent);
            
            // Try search button as fallback
            await this.sleep(200);
            const searchButton = this.findNearbySearchButton(element);
            if (searchButton) {
                searchButton.click();
            }
        }
        
        return {
            message: `Searched for: ${message.text || message.value || ''}`,
            ...typeResult
        };
    }
    
    /**
     * Check if an element is a search field
     */
    isSearchField(element) {
        if (!element) return false;
        
        // Check element attributes for search indicators
        const searchIndicators = [
            element.type === 'search',
            (element.placeholder || '').toLowerCase().includes('search'),
            (element.name || '').toLowerCase().includes('search'),
            (element.id || '').toLowerCase().includes('search'),
            (element.className || '').toLowerCase().includes('search'),
            element.getAttribute('aria-label')?.toLowerCase().includes('search'),
            element.getAttribute('data-testid')?.toLowerCase().includes('search'),
            // YouTube specific
            (element.name || '') === 'search_query',
            (element.className || '').includes('ytSearchboxComponentInput'),
            (element.className || '').includes('yt-searchbox-input'),
            // General search patterns
            (element.getAttribute('role') || '') === 'searchbox',
            (element.getAttribute('autocomplete') || '') === 'off' && (element.placeholder || '').toLowerCase().includes('search')
        ];
        
        const isSearch = searchIndicators.some(indicator => indicator);
        
        if (isSearch) {
            console.log('🔍 Detected search field:', element.tagName, element.className, element.name, element.id);
        }
        
        return isSearch;
    }
    
    /**
     * Find nearby search button to click as fallback
     */
    findNearbySearchButton(inputElement) {
        // YouTube specific search button
        const ytSearchButton = document.querySelector('#search-icon-legacy, button[aria-label*="Search"], .ytSearchboxComponentSearchButton');
        if (ytSearchButton && this.isVisible(ytSearchButton)) {
            console.log('🔍 Found YouTube search button:', ytSearchButton.className, ytSearchButton.tagName);
            return ytSearchButton;
        }
        
        // Look in the same form first
        const form = inputElement.closest('form');
        if (form) {
            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitButton && this.isVisible(submitButton)) {
                console.log('🔍 Found form submit button');
                return submitButton;
            }
            
            // Look for buttons with search-related text/classes
            const searchButtons = form.querySelectorAll('button, input[type="button"]');
            for (const button of searchButtons) {
                if (!this.isVisible(button)) continue;
                
                const buttonText = (button.textContent || button.value || '').toLowerCase();
                const buttonClass = (button.className || '').toLowerCase();
                const buttonId = (button.id || '').toLowerCase();
                const buttonAriaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                
                if (buttonText.includes('search') || 
                    buttonClass.includes('search') || 
                    buttonId.includes('search') ||
                    buttonAriaLabel.includes('search')) {
                    console.log('🔍 Found search button in form:', button.className);
                    return button;
                }
            }
        }
        
        // Look for nearby search buttons (within same container or siblings)
        let container = inputElement.parentElement;
        for (let level = 0; level < 3; level++) {
            if (!container) break;
            
            const nearbyButtons = container.querySelectorAll('button, input[type="button"], input[type="submit"]');
            for (const button of nearbyButtons) {
                if (!this.isVisible(button)) continue;
                
                const buttonText = (button.textContent || button.value || '').toLowerCase();
                const buttonClass = (button.className || '').toLowerCase();
                const buttonId = (button.id || '').toLowerCase();
                const buttonAriaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                
                if (buttonText.includes('search') || 
                    buttonClass.includes('search') || 
                    buttonId.includes('search') ||
                    buttonAriaLabel.includes('search')) {
                    console.log('🔍 Found nearby search button:', button.className);
                    return button;
                }
            }
            
            container = container.parentElement;
        }
        
        console.log('❌ No search button found');
        return null;
    }
    
    /**
     * Check if an element can accept text input
     */
    isTypeableElement(element) {
        if (!element) return false;
        
        // Check for content editable elements
        if (element.isContentEditable) return true;
        
        // Check for form input elements
        if ('value' in element) return true;
        
        // Check for specific input types
        const inputTags = ['input', 'textarea'];
        if (inputTags.includes(element.tagName.toLowerCase())) return true;
        
        return false;
    }
    
    /**
     * Find a nearby input element within the same container
     */
    findNearbyInput(element) {
        // Look for inputs within the same parent
        const parent = element.parentElement;
        if (parent) {
            const inputs = parent.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable="true"]');
            if (inputs.length > 0) {
                return inputs[0];
            }
        }
        
        // Look for inputs within the same container (up to 3 levels)
        let container = element;
        for (let i = 0; i < 3; i++) {
            container = container.parentElement;
            if (!container) break;
            
            const inputs = container.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable="true"]');
            if (inputs.length > 0) {
                // Return the closest one
                return Array.from(inputs).sort((a, b) => {
                    const distA = this.getElementDistance(element, a);
                    const distB = this.getElementDistance(element, b);
                    return distA - distB;
                })[0];
            }
        }
        
        return null;
    }
    
    /**
     * Calculate rough distance between two elements
     */
    getElementDistance(el1, el2) {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();
        
        const x1 = rect1.left + rect1.width / 2;
        const y1 = rect1.top + rect1.height / 2;
        const x2 = rect2.left + rect2.width / 2;
        const y2 = rect2.top + rect2.height / 2;
        
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    async handleSelect(message) {
        const element = this.locateElement(message);
        if (!element) {
            throw new Error(`Select element not found for selector/agent: ${message.selector || message.agentId || 'unknown'}`);
        }

        if (element.tagName.toLowerCase() !== 'select') {
            throw new Error('Target element is not a <select> element');
        }

    const value = message.value ?? message.option ?? message.optionText ?? message.text;
        if (value === undefined) {
            throw new Error('Value is required to select an option');
        }

        const options = Array.from(element.options || []);
        let option = options.find(opt => opt.value === value);
        if (!option) {
            option = options.find(opt => opt.textContent.trim().toLowerCase() === String(value).trim().toLowerCase());
        }

        if (!option) {
            throw new Error(`Option "${value}" not found in select element`);
        }

        element.value = option.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        this.logAction(`Selected option "${option.textContent.trim()}" in ${this.describeElement(element)}`);

        return {
            message: `Selected option ${option.textContent.trim()}`,
            value: option.value
        };
    }

    async handleScroll(message) {
        const direction = (message.direction || 'down').toLowerCase();
        const amount = Number(message.amount ?? 300) || 300;
        const targetSelector = message.selector || message.agentId;

        if (targetSelector) {
            const targetElement = this.resolveElement(targetSelector);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: message.block || 'center' });
                await this.sleep(600);
                return {
                    message: `Scrolled ${direction} to element ${this.describeElement(targetElement)}`,
                    selector: targetSelector
                };
            }
        }

        const delta = direction === 'up' ? -amount : amount;
        window.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
        await this.sleep(Math.min(1200, Math.max(300, Math.abs(delta))));

        this.logAction(`Scrolled ${direction} by ${amount}px`);

        return {
            message: `Scrolled ${direction}`,
            direction,
            amount: amount
        };
    }

    async handleHover(message) {
        const element = this.locateElement(message);
        if (!element) {
            throw new Error(`Element not found for hover: ${message.selector || message.agentId || 'unknown'}`);
        }

        const eventInit = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new MouseEvent('mouseover', eventInit));
        element.dispatchEvent(new MouseEvent('mouseenter', eventInit));

        this.highlightElement(element);
        setTimeout(() => this.removeHighlight(), 250);

        this.logAction(`Hovered over ${this.describeElement(element)}`);

        return {
            message: `Hovered over element`,
            selector: message.selector || null
        };
    }

    async handleWaitForElement(message) {
        const selector = message.selector || message.agentId;
        if (!selector) {
            throw new Error('Selector is required to wait for element');
        }

        const condition = (message.condition || 'visible').toLowerCase();
        const timeout = Number(message.timeout) || 10000;
        const start = performance.now();
        const pollInterval = 200;

        return await new Promise((resolve, reject) => {
            const checkCondition = () => {
                const element = this.resolveElement(selector);
                if (this.elementMeetsCondition(element, condition)) {
                    resolve({
                        message: `Element ${selector} is ${condition}`,
                        selector,
                        condition
                    });
                    return true;
                }

                if (performance.now() - start > timeout) {
                    reject(new Error(`Timed out waiting for ${selector} to be ${condition}`));
                    return true;
                }

                return false;
            };

            if (checkCondition()) {
                return;
            }

            const intervalId = setInterval(() => {
                if (checkCondition()) {
                    clearInterval(intervalId);
                }
            }, pollInterval);
        });
    }

    async handleHandlePopup(message) {
        const action = (message.action || 'dismiss').toLowerCase();

        const key = action === 'accept' ? 'Enter' : 'Escape';
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));

        // Attempt to click common close buttons for overlays/modals
        const closeSelectors = ['[data-dismiss="modal"]', '.modal [aria-label="Close"]', '.modal .close', '[role="dialog"] button', '.popup-close'];
        for (const selector of closeSelectors) {
            const button = document.querySelector(selector);
            if (button && this.isVisible(button)) {
                button.click();
                break;
            }
        }

        this.logAction(`Popup handler executed with action: ${action}`);

        return {
            message: `Popup handling attempted with action: ${action}`,
            action
        };
    }

    async handleGetText(message) {
        const element = this.locateElement(message);
        if (!element) {
            throw new Error(`Element not found for get_text: ${message.selector || message.agentId || 'unknown'}`);
        }

        const text = element.innerText || element.textContent || '';
        return {
            message: 'Text retrieved successfully',
            text: text.trim()
        };
    }

    async handleGetAttribute(message) {
        const element = this.locateElement(message);
        if (!element) {
            throw new Error(`Element not found for get_attribute: ${message.selector || message.agentId || 'unknown'}`);
        }

        const attribute = message.attribute;
        if (!attribute) {
            throw new Error('Attribute name is required');
        }

        const value = element.getAttribute(attribute);
        return {
            message: `Attribute ${attribute} retrieved`,
            value
        };
    }

    async handleGetHtml() {
        return {
            message: 'Page HTML captured',
            html: document.documentElement.outerHTML
        };
    }

    async handleGetTitle() {
        return {
            message: 'Page title retrieved',
            title: document.title || ''
        };
    }

    async handleWaitForLoad(message) {
        const timeout = Number(message.timeout) || 10000;

        if (document.readyState === 'complete') {
            return {
                message: 'Page already loaded',
                readyState: document.readyState
            };
        }

        return await new Promise((resolve, reject) => {
            const timerId = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out waiting for page load'));
            }, timeout);

            const onLoad = () => {
                cleanup();
                resolve({ message: 'Page load completed', readyState: document.readyState });
            };

            const cleanup = () => {
                clearTimeout(timerId);
                window.removeEventListener('load', onLoad, true);
                document.removeEventListener('readystatechange', onReadyStateChange, true);
            };

            const onReadyStateChange = () => {
                if (document.readyState === 'complete') {
                    onLoad();
                }
            };

            window.addEventListener('load', onLoad, true);
            document.addEventListener('readystatechange', onReadyStateChange, true);
        });
    }

    async handleGetPageData() {
        const selectors = [
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

        const rawElements = Array.from(document.querySelectorAll(selectors.join(',')));
        const uniqueElements = Array.from(new Set(rawElements));
        
        // Enhance elements by finding actual inputs within wrappers
        const enhancedElements = uniqueElements.map(element => {
            // If this is a wrapper element, try to find actual input inside
            const actualInput = this.findActualInputInWrapper(element);
            return actualInput || element;
        });
        
        // Remove duplicates again after enhancement
        const finalUniqueElements = Array.from(new Set(enhancedElements));
        
        // Sort video elements to ensure first video comes first
        const sortedElements = this.prioritizeVideoOrder(finalUniqueElements);
        
        const interactiveElements = sortedElements.map((element, index) => this.serializeElement(element, index + 1));

        return {
            message: `Collected ${interactiveElements.length} interactive elements`,
            interactiveElements,
            title: document.title || '',
            url: window.location.href,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Prioritize video order to ensure first video appears first
     */
    prioritizeVideoOrder(elements) {
        const videoElements = [];
        const otherElements = [];
        
        elements.forEach(element => {
            if (this.isVideoElement(element)) {
                videoElements.push(element);
            } else {
                otherElements.push(element);
            }
        });
        
        // Sort video elements by their position in the page (top to bottom)
        videoElements.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            
            // Sort by vertical position first (top videos first)
            if (Math.abs(rectA.top - rectB.top) > 50) {
                return rectA.top - rectB.top;
            }
            
            // If same row, sort by horizontal position (left videos first)
            return rectA.left - rectB.left;
        });
        
        // Return videos first, then other elements
        return [...videoElements, ...otherElements];
    }
    
    /**
     * Check if element is a video-related element
     */
    isVideoElement(element) {
        if (!element) return false;
        
        const href = element.href || '';
        const className = element.className || '';
        const id = element.id || '';
        const tagName = element.tagName?.toLowerCase() || '';
        
        // YouTube specific video patterns
        if (className.includes('ytd-video-renderer') || 
            className.includes('ytd-compact-video') ||
            id.includes('video-title') ||
            href.includes('/watch')) {
            return true;
        }
        
        // General video patterns
        return (
            href.includes('video') ||
            className.includes('video') ||
            id.includes('video') ||
            tagName === 'video'
        );
    }
    
    /**
     * Find actual input element within a wrapper element
     */
    findActualInputInWrapper(wrapperElement) {
        // If this is already an input element, return it
        if (this.isTypeableElement(wrapperElement)) {
            return wrapperElement;
        }
        
        // Look for input elements within this wrapper
        const inputSelectors = [
            'input[type="text"]',
            'input[type="search"]', 
            'input[type="email"]',
            'input[type="password"]',
            'input:not([type])',
            'textarea',
            '[contenteditable="true"]',
            '[role="textbox"]'
        ];
        
        for (const selector of inputSelectors) {
            const input = wrapperElement.querySelector(selector);
            if (input && this.isVisible(input)) {
                return input;
            }
        }
        
        return null; // Return null if no input found, caller will use original element
    }

    locateElement(message) {
        this.logAction(`🔍 locateElement called with: ${JSON.stringify({selector: message.selector, agentId: message.agentId, agent_id: message.agent_id, agentID: message.agentID, text: message.text})}`);
        const selectorCandidates = [message.selector, message.agentId, message.agent_id, message.agentID];
        this.logAction(`🔍 Trying selector candidates: ${JSON.stringify(selectorCandidates)}`);
        
        for (const candidate of selectorCandidates) {
            if (candidate) {
                this.logAction(`🔍 Trying candidate: ${candidate}`);
                const resolved = this.resolveElement(candidate);
                if (resolved) {
                    this.logAction(`✅ Successfully resolved element: ${this.describeElement(resolved)}`);
                    return resolved;
                } else {
                    this.logAction(`❌ Failed to resolve candidate: ${candidate}`);
                }
            }
        }

        if (message.text) {
            this.logAction(`🔍 Trying text match: ${message.text}`);
            const textMatch = this.findElementByText(message.text);
            if (textMatch) {
                this.logAction(`✅ Found by text: ${this.describeElement(textMatch)}`);
                return textMatch;
            }
        }

        this.logAction('❌ locateElement failed - no element found');
        return null;
    }

    resolveElement(selector) {
        if (!selector || typeof selector !== 'string') {
            return null;
        }

        const trimmed = selector.trim();
        if (!trimmed) {
            return null;
        }

        this.logAction(`🔍 Resolving element selector: ${trimmed}`);

        // Handle xpath selectors
        if (trimmed.startsWith('xpath:')) {
            return this.resolveXPath(trimmed.slice(6));
        }

        if (trimmed.startsWith('//') || trimmed.startsWith('(')) {
            return this.resolveXPath(trimmed);
        }

        // Try direct querySelector first
        try {
            const element = document.querySelector(trimmed);
            if (element && element !== document.documentElement && element !== document.body) {
                console.debug('Element resolved via querySelector:', trimmed, '→', element.tagName, element.className || element.id);
                return element;
            } else if (element === document.documentElement || element === document.body) {
                console.warn('querySelector returned document root, selector too broad:', trimmed);
            }
        } catch (error) {
            // ignore invalid selector errors
            console.warn('Invalid CSS selector:', trimmed, error.message);
        }

        // Clean up agent_id prefixes
        let normalized = trimmed
            .replace(/^agent_id[:_]?/i, '')
            .replace(/^id[:_]?/i, '')
            .replace(/^name[:_]?/i, '');

        // Handle video element agent IDs that have position suffix (_video_XX)
        if (normalized.includes('_video_')) {
            const videoMatch = normalized.match(/^(.+)_video_\d+$/);
            if (videoMatch) {
                normalized = videoMatch[1]; // Remove the _video_XX suffix
            }
        }

        if (normalized) {
            // Try by ID
            const byId = document.getElementById(normalized);
            if (byId) {
                return byId;
            }

            // Try by name attribute
            const byName = document.getElementsByName(normalized)[0];
            if (byName) {
                return byName;
            }

            // Try by data-agent-id
            const dataAttr = document.querySelector(`[data-agent-id="${normalized}"]`);
            if (dataAttr) {
                return dataAttr;
            }

            // Try by class (sanitize class name)
            const sanitizedClass = normalized.replace(/[^a-z0-9_-]/gi, '');
            if (sanitizedClass) {
                const classMatch = document.querySelector(`.${sanitizedClass}`);
                if (classMatch && classMatch !== document.documentElement && classMatch !== document.body) {
                    return classMatch;
                }
            }
        }

        // Special handling for synthetic input element IDs (input_text_X, input_email_X, etc.)
        if (trimmed.match(/^input_[a-z]+_\d+$/)) {
            this.logAction(`🔍 Handling synthetic input ID: ${trimmed}`);
            const inputMatch = trimmed.match(/^input_([a-z]+)_(\d+)$/);
            if (inputMatch) {
                const inputType = inputMatch[1];
                const position = parseInt(inputMatch[2]);
                this.logAction(`🔍 Looking for input type "${inputType}" at position ${position}`);
                const result = this.findInputByTypeAndPosition(inputType, position);
                this.logAction(`🔍 Found input element: ${result ? this.describeElement(result) : 'null'}`);
                return result;
            }
        }

        // Special handling for other synthetic element IDs (tagname_counter pattern)
        if (trimmed.match(/^[a-z]+_\d+$/)) {
            this.logAction(`🔍 Handling synthetic element ID: ${trimmed}`);
            const syntheticMatch = trimmed.match(/^([a-z]+)_(\d+)$/);
            if (syntheticMatch) {
                const tagName = syntheticMatch[1];
                const position = parseInt(syntheticMatch[2]);
                this.logAction(`🔍 Looking for ${tagName} at position ${position}`);
                const result = this.findElementByTagAndPosition(tagName, position);
                this.logAction(`🔍 Found element: ${result ? this.describeElement(result) : 'null'}`);
                return result;
            }
        }

        // Special handling for video elements with position - try to find by position
        if (trimmed.includes('_video_')) {
            const videoMatch = trimmed.match(/^.+_video_(\d+)$/);
            if (videoMatch) {
                const position = parseInt(videoMatch[1]);
                return this.findVideoByPosition(position);
            }
        }

        return null;
    }

    resolveXPath(xpathExpression) {
        if (!xpathExpression) {
            return null;
        }

        try {
            const result = document.evaluate(
                xpathExpression,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );
            return result.singleNodeValue;
        } catch (error) {
            console.warn('Invalid XPath expression:', xpathExpression, error);
            return null;
        }
    }

    findElementByText(text) {
        if (!text) {
            return null;
        }

        const escapedText = text.replace(/"/g, '\\"');
        const xpath = `//*[contains(normalize-space(.), "${escapedText}")]`;
        return this.resolveXPath(xpath);
    }

    elementMeetsCondition(element, condition) {
        switch (condition) {
            case 'visible':
                return Boolean(element) && this.isVisible(element);
            case 'hidden':
                return !element || !this.isVisible(element);
            case 'enabled':
                return Boolean(element) && !element.disabled;
            case 'clickable':
                return Boolean(element) && this.isVisible(element) && !element.disabled;
            case 'exists':
                return Boolean(element);
            default:
                return Boolean(element);
        }
    }

    dispatchMouseEvents(element) {
        const eventInit = { bubbles: true, cancelable: true, view: window };
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, eventInit));
        });
    }

    highlightElement(element) {
        this.removeHighlight();
        this.highlightedElement = element;
        element.classList.add('voice-assistant-highlight');
    }

    removeHighlight() {
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('voice-assistant-highlight');
            this.highlightedElement.classList.remove('voice-assistant-typing');
            this.highlightedElement.classList.remove('voice-assistant-clicked');
            this.highlightedElement = null;
        }
    }

    serializeElement(element, index) {
        const rect = element.getBoundingClientRect();
        const attributes = this.collectAttributes(element);
        const isVideo = this.isVideoElement(element);

        return {
            index,
            tagName: element.tagName,
            id: element.id || null,
            name: element.getAttribute('name') || null,
            className: element.className || null,
            type: element.type || null,
            textContent: (element.innerText || element.textContent || '').trim().slice(0, 200),
            value: element.value !== undefined ? element.value : null,
            placeholder: element.placeholder || null,
            href: element.href || null,
            isVisible: this.isVisible(element),
            isVideoElement: isVideo,
            videoPosition: isVideo ? this.getVideoPosition(element) : null,
            boundingRect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
            },
            attributes,
            xpath: this.getXPath(element)
        };
    }
    
    /**
     * Get the position of this video in the list (1st, 2nd, etc.)
     */
    getVideoPosition(element) {
        if (!this.isVideoElement(element)) return 0;
        
        // Find all video elements on the page
        const allVideos = Array.from(document.querySelectorAll('a[href*="/watch"], .ytd-video-renderer a, [class*="video"]'))
            .filter(el => this.isVideoElement(el) && this.isVisible(el));
        
        // Sort by position (top to bottom, left to right)
        allVideos.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            
            if (Math.abs(rectA.top - rectB.top) > 50) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });
        
        const position = allVideos.indexOf(element) + 1;
        return position > 0 ? position : 0;
    }

    findVideoByPosition(targetPosition) {
        // Find all video elements on the page
        const allVideos = Array.from(document.querySelectorAll('a[href*="/watch"], .ytd-video-renderer a, [class*="video"]'))
            .filter(el => this.isVideoElement(el) && this.isVisible(el));
        
        // Sort by position (top to bottom, left to right)
        allVideos.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            
            if (Math.abs(rectA.top - rectB.top) > 50) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });
        
        // Return the video at the target position (1-indexed)
        return allVideos[targetPosition - 1] || null;
    }

    findInputByTypeAndPosition(inputType, targetPosition) {
        this.logAction(`🔍 findInputByTypeAndPosition: Looking for input type="${inputType}" at position=${targetPosition}`);
        
        // Find all input elements of the specified type
        const allInputs = Array.from(document.querySelectorAll(`input[type="${inputType}"], input:not([type])`))
            .filter(el => {
                const type = el.type || 'text';
                const matches = type === inputType && this.isVisible(el);
                this.logAction(`🔍 Input element check: type=${type}, matches=${matches}, visible=${this.isVisible(el)}`);
                return matches;
            });
        
        this.logAction(`🔍 Found ${allInputs.length} matching input elements`);
        
        // Sort by position (top to bottom, left to right)
        allInputs.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            
            if (Math.abs(rectA.top - rectB.top) > 10) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });
        
        allInputs.forEach((input, index) => {
            this.logAction(`🔍 Input ${index}: ${this.describeElement(input)}`);
        });
        
        // Return the input at the target position (1-indexed, but our counter is 0-indexed)
        const result = allInputs[targetPosition] || null;
        this.logAction(`🔍 Returning input at position ${targetPosition}: ${result ? this.describeElement(result) : 'null'}`);
        return result;
    }

    findElementByTagAndPosition(tagName, targetPosition) {
        // Find all elements of the specified tag
        const allElements = Array.from(document.querySelectorAll(tagName))
            .filter(el => this.isVisible(el));
        
        // Sort by position (top to bottom, left to right)
        allElements.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            
            if (Math.abs(rectA.top - rectB.top) > 10) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });
        
        // Return the element at the target position (1-indexed, but our counter is 0-indexed)
        return allElements[targetPosition] || null;
    }

    collectAttributes(element) {
        const attributes = {};
        for (const attr of element.attributes || []) {
            attributes[attr.name] = attr.value;
        }
        return attributes;
    }

    isVisible(element) {
        if (!element) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const hasSize = rect.width > 0 && rect.height > 0;
        const displayVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

        return hasSize && displayVisible;
    }

    getXPath(element) {
        if (element.id) {
            return `//*[@id="${element.id}"]`;
        }

        const parts = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = element.previousSibling;
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }
            const tagName = element.nodeName.toLowerCase();
            const part = index > 1 ? `${tagName}[${index}]` : tagName;
            parts.unshift(part);
            element = element.parentNode;
        }

        return `/${parts.join('/')}`;
    }

    describeElement(element) {
        if (!element) {
            return 'unknown element';
        }

        const idPart = element.id ? `#${element.id}` : '';
        const classPart = element.className ? `.${element.className.toString().split(' ').filter(Boolean).join('.')}` : '';
        return `${element.tagName.toLowerCase()}${idPart}${classPart}`;
    }

    normalizeUrl(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        const trimmed = url.trim();
        if (!trimmed) {
            return null;
        }

        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }

        return `https://${trimmed}`;
    }

    injectStyles() {
        if (document.getElementById('voice-assistant-styles')) {
            return;
        }

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
        `;

        document.head.appendChild(style);
    }

    logAction(message) {
        try {
            chrome.runtime.sendMessage({
                type: 'CONTENT_LOG',
                message,
                timestamp: new Date().toISOString()
            }).catch(() => {
                // Ignore send errors (sidebar might not be open)
            });
        } catch (error) {
            console.warn('Failed to send log message:', error);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new AutonomousContentController());
} else {
    new AutonomousContentController();
}class WebPageController {
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