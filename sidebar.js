class WebAssistantChat {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.isAgentRunning = false;
        this.initializeElements();
        this.initializeVoiceRecognition();
        this.setupEventListeners();
        this.setupMessageListener();
        this.checkApiKeyStatus();
    }

    initializeElements() {
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.voiceBtn = document.getElementById('voiceBtn');
        this.sendBtn = document.getElementById('sendBtn');
        this.actionLog = document.getElementById('actionLog');
        this.clearChatBtn = document.getElementById('clearChatBtn');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
    }

    async checkApiKeyStatus() {
        try {
            const result = await chrome.storage.sync.get(['geminiApiKey']);
            if (!result.geminiApiKey) {
                this.showApiKeySetup();
            } else {
                this.addMessage('🤖 Autonomous Web Agent ready! Give me a task to complete.', 'assistant');
            }
        } catch (error) {
            console.error('Error checking API key:', error);
            this.showApiKeySetup();
        }
    }

    showApiKeySetup() {
        this.addMessage(`
            🔑 **API Key Required**
            
            To use the Autonomous Web Agent, you need to provide your Gemini API key.
            
            1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
            2. Type: \`/setkey YOUR_API_KEY\` to configure it
            3. Start automating the web!
            
            Your API key will be stored securely in your browser.
        `, 'assistant');
    }

    initializeVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                this.updateStatus('listening', 'Listening...');
                this.isListening = true;
                this.voiceBtn.classList.add('active');
                this.voiceBtn.textContent = '🔴';
            };
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.messageInput.value = transcript;
                this.sendMessage();
            };
            
            this.recognition.onerror = (event) => {
                this.logAction(`Voice recognition error: ${event.error}`, 'error');
                this.stopListening();
            };
            
            this.recognition.onend = () => {
                this.stopListening();
            };
        } else {
            this.logAction('Speech recognition not supported in this browser', 'warning');
        }
    }

    setupEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.voiceBtn.addEventListener('click', () => this.toggleVoice());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.clearChatBtn.addEventListener('click', () => this.clearChat());
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        
        // Auto-focus on input
        this.messageInput.focus();
        
        // Add stop button handler
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('stop-btn')) {
                this.stopAgent();
            }
        });
    }

    setupMessageListener() {
        // Check if we're in an extension context
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'ACTION_COMPLETED') {
                    this.logAction(message.description);
                    this.addMessage(message.response || 'Action completed', 'assistant');
                } else if (message.type === 'ACTION_ERROR') {
                    this.logAction(message.description, 'error');
                    this.addMessage('Error: ' + message.error, 'assistant');
                } else if (message.type === 'CONTENT_LOG') {
                    this.logAction(message.message, message.level);
                } else if (message.type === 'USER_INTERACTION') {
                    this.handleUserInteractionRequest(message);
                } else if (message.type === 'AGENT_LOG') {
                    this.logAction(message.message, message.level || 'info');
                }
            });
        } else {
            // Not in extension context - show demo mode
            this.logAction('Demo mode - Extension features disabled outside of Chrome extension context', 'warning');
        }
    }

    toggleVoice() {
        if (this.recognition) {
            if (this.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        } else {
            this.addMessage('Voice recognition not available in this browser', 'assistant');
        }
    }

    startListening() {
        if (this.recognition && !this.isListening) {
            this.recognition.start();
            this.logAction('Started voice recognition');
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        this.updateStatus('ready', 'Ready to chat');
        this.isListening = false;
        this.voiceBtn.classList.remove('active');
        this.voiceBtn.textContent = '🎤';
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;
        
        // Handle special commands
        if (message.startsWith('/setkey ')) {
            this.handleSetApiKey(message.substring(8));
            this.messageInput.value = '';
            return;
        }
        
        if (message === '/help') {
            this.showHelp();
            this.messageInput.value = '';
            return;
        }
        
        if (message === '/stop' && this.isAgentRunning) {
            this.stopAgent();
            this.messageInput.value = '';
            return;
        }
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Clear input
        this.messageInput.value = '';
        
        // Process the command
        this.processCommand(message);
    }

    async handleSetApiKey(apiKey) {
        if (!apiKey || apiKey.length < 10) {
            this.addMessage('❌ Invalid API key. Please provide a valid Gemini API key.', 'assistant');
            return;
        }
        
        try {
            this.addMessage('⏳ Setting up API key...', 'assistant');
            
            const response = await chrome.runtime.sendMessage({
                type: 'SET_API_KEY',
                apiKey: apiKey
            });
            
            if (response.success) {
                this.addMessage('✅ API key configured successfully! The autonomous agent is now ready to help you.', 'assistant');
                this.logAction('API key configured successfully');
            } else {
                this.addMessage(`❌ Failed to set API key: ${response.error}`, 'assistant');
                this.logAction('Failed to set API key', 'error');
            }
        } catch (error) {
            this.addMessage(`❌ Error setting API key: ${error.message}`, 'assistant');
            this.logAction(`Error setting API key: ${error.message}`, 'error');
        }
    }

    showHelp() {
        const helpText = `
🤖 **Autonomous Web Agent Commands**

**Basic Usage:**
- Type any web automation task in natural language
- Examples: "Go to Google and search for restaurants"
- "Fill out the contact form on this website"
- "Add 3 items to my cart and checkout"

**Special Commands:**
- \`/setkey YOUR_API_KEY\` - Configure your Gemini API key
- \`/help\` - Show this help message
- \`/stop\` - Stop current agent execution
- \`/clear\` - Clear chat history

**Agent Features:**
- 🎯 Autonomous task execution
- 🧠 AI-powered decision making
- 🔄 Error recovery and re-orientation
- 💬 Interactive user assistance
- 📋 Complete workflow automation

The agent will break down complex tasks into steps and execute them automatically!
        `;
        this.addMessage(helpText, 'assistant');
    }

    addMessage(content, type, isHtml = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isHtml) {
            contentDiv.innerHTML = content;
        } else {
            contentDiv.textContent = content;
        }
        
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        // If it's an assistant message and not HTML, speak it
        if (type === 'assistant' && !isHtml) {
            this.speakText(content);
        }
    }

    async processCommand(command) {
        if (this.isAgentRunning) {
            this.addMessage('⚠️ Agent is already running. Please wait for it to complete or type /stop to interrupt.', 'assistant');
            return;
        }
        
        this.updateStatus('processing', 'Processing request...');
        this.isAgentRunning = true;
        this.addStopButton();
        
        this.logAction(`User request: "${command}"`);
        
        try {
            // Check if we're in extension context
            if (typeof chrome === 'undefined' || !chrome.runtime) {
                throw new Error('Extension context not available');
            }
            
            // Send command to background script for autonomous processing
            const response = await chrome.runtime.sendMessage({
                type: 'PROCESS_COMMAND',
                command: command
            });
            
            if (response && response.success) {
                if (response.needsApiKey) {
                    this.showApiKeySetup();
                } else {
                    this.addMessage(response.aiResponse, 'assistant');
                    this.logAction('Request processing started');
                }
            } else {
                this.addMessage(response.error || 'Sorry, I couldn\'t process that request.', 'assistant');
                this.logAction('Request processing failed', 'error');
            }
        } catch (error) {
            this.logAction(`Error processing request: ${error.message}`, 'error');
            this.addMessage('Sorry, there was an error processing your request.', 'assistant');
        }
        
        this.updateStatus('ready', 'Ready to chat');
        this.isAgentRunning = false;
        this.removeStopButton();
    }

    addStopButton() {
        // Remove existing stop button if any
        this.removeStopButton();
        
        const stopBtn = document.createElement('button');
        stopBtn.className = 'stop-btn control-btn';
        stopBtn.textContent = '🛑 Stop Agent';
        stopBtn.style.backgroundColor = '#f44336';
        
        this.controls = document.querySelector('.controls');
        this.controls.appendChild(stopBtn);
    }

    removeStopButton() {
        const existingStopBtn = document.querySelector('.stop-btn');
        if (existingStopBtn) {
            existingStopBtn.remove();
        }
    }

    async stopAgent() {
        this.logAction('Stopping agent execution...');
        
        try {
            await chrome.runtime.sendMessage({
                type: 'STOP_AGENT'
            });
            
            this.addMessage('🛑 Agent execution stopped.', 'assistant');
            this.isAgentRunning = false;
            this.removeStopButton();
            this.updateStatus('ready', 'Ready to chat');
        } catch (error) {
            this.logAction(`Error stopping agent: ${error.message}`, 'error');
        }
    }

    handleUserInteractionRequest(message) {
        switch (message.type) {
            case 'input_request':
                this.showInputRequest(message);
                break;
            case 'help_request':
                this.showHelpRequest(message);
                break;
            case 'confirmation':
                this.showConfirmation(message);
                break;
            case 'multiple_choice':
                this.showMultipleChoice(message);
                break;
            case 'status_update':
                this.addMessage(`ℹ️ ${message.message}`, 'assistant');
                break;
            case 'progress_update':
                this.showProgress(message);
                break;
        }
    }

    showInputRequest(request) {
        const { title, message, fields, requestId } = request;
        
        let formHtml = `<div class="user-input-form">
            <h4>${title}</h4>
            <p>${message}</p>
            <form id="input-form-${requestId}">`;
        
        fields.forEach(field => {
            formHtml += `
                <div class="form-field">
                    <label for="${field.name}">${field.label}:</label>
                    <input type="${field.type}" id="${field.name}" name="${field.name}" 
                           placeholder="${field.description}" 
                           ${field.required ? 'required' : ''}/>
                </div>
            `;
        });
        
        formHtml += `
                <div class="form-buttons">
                    <button type="submit" class="submit-btn">Submit</button>
                    <button type="button" class="cancel-btn">Cancel</button>
                </div>
            </form>
        </div>`;
        
        this.addMessage(formHtml, 'assistant', true); // true for HTML content
        
        // Setup form handlers
        const form = document.getElementById(`input-form-${requestId}`);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitUserInput(requestId, new FormData(form));
        });
        
        form.querySelector('.cancel-btn').addEventListener('click', () => {
            this.cancelUserInput(requestId);
        });
    }

    async submitUserInput(requestId, formData) {
        const responses = {};
        for (const [key, value] of formData.entries()) {
            responses[key] = value;
        }
        
        await chrome.runtime.sendMessage({
            type: 'USER_RESPONSE',
            requestId: requestId,
            responses: responses
        });
        
        this.addMessage('✅ Information submitted to agent.', 'assistant');
    }

    async cancelUserInput(requestId) {
        await chrome.runtime.sendMessage({
            type: 'USER_RESPONSE',
            requestId: requestId,
            cancelled: true
        });
        
        this.addMessage('❌ Input request cancelled.', 'assistant');
    }

    async executeAction(action) {
        try {
            // Check if we're in extension context
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.tabs) {
                throw new Error('Extension context not available');
            }
            
            // Get the current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }
            
            // Send action to content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'EXECUTE_ACTION',
                action: action
            });
            
            if (response && response.success) {
                this.logAction(`Action executed: ${action.type}`);
            } else {
                this.logAction(`Action failed: ${action.type}`, 'error');
            }
        } catch (error) {
            this.logAction(`Error executing action: ${error.message}`, 'error');
        }
    }

    updateStatus(type, text) {
        this.statusDot.className = `status-dot ${type}`;
        this.statusText.textContent = text;
    }

    speakText(text) {
        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.8;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            speechSynthesis.speak(utterance);
        }
    }

    logAction(description, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${description}`;
        
        this.actionLog.appendChild(logEntry);
        this.actionLog.scrollTop = this.actionLog.scrollHeight;
    }

    clearChat() {
        this.chatMessages.innerHTML = `
            <div class="message assistant-message">
                <div class="message-content">
                    🤖 Chat cleared! I'm your autonomous web agent. Give me a complex web task and I'll break it down and execute it step by step.
                    <br><br>
                    Examples:
                    <br>• "Find and book a restaurant for tonight"
                    <br>• "Research laptops under $1000 and add the best one to cart"
                    <br>• "Sign up for a newsletter on this website"
                </div>
            </div>
        `;
        this.logAction('Chat cleared');
    }

    clearLog() {
        this.actionLog.innerHTML = '';
        this.logAction('Log cleared');
    }

    showProgress(progressData) {
        const { current, total, percentage, description } = progressData;
        const progressHtml = `
            <div class="progress-update">
                <div class="progress-text">${description}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="progress-numbers">${current}/${total} (${percentage}%)</div>
            </div>
        `;
        this.addMessage(progressHtml, 'assistant', true);
    }

    openSettings() {
        this.logAction('Settings clicked');
        this.showHelp(); // Show help as settings for now
    }
}

// Initialize the assistant when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WebAssistantChat();
});