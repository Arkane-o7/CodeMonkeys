class WebAssistantChat {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.initializeElements();
        this.initializeVoiceRecognition();
        this.setupEventListeners();
        this.setupMessageListener();
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
                    this.logAction(message.message);
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
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Clear input
        this.messageInput.value = '';
        
        // Process the command
        this.processCommand(message);
    }

    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        // If it's an assistant message, speak it
        if (type === 'assistant') {
            this.speakText(content);
        }
    }

    async processCommand(command) {
        this.updateStatus('processing', 'Processing...');
        this.addMessage('Processing your request...', 'assistant');
        
        this.logAction(`User command: "${command}"`);
        
        try {
            // Check if we're in extension context
            if (typeof chrome === 'undefined' || !chrome.runtime) {
                throw new Error('Extension context not available');
            }
            
            // Send command to background script for AI processing
            const response = await chrome.runtime.sendMessage({
                type: 'PROCESS_COMMAND',
                command: command
            });
            
            if (response && response.success) {
                // Remove the processing message
                const messages = this.chatMessages.children;
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.textContent.includes('Processing your request')) {
                    lastMessage.remove();
                }
                
                this.addMessage(response.aiResponse, 'assistant');
                // Execute the action via content script
                await this.executeAction(response.action);
            } else {
                this.addMessage('Sorry, I couldn\'t understand that command.', 'assistant');
                this.logAction('Command processing failed', 'error');
            }
        } catch (error) {
            this.logAction(`Error processing command: ${error.message}`, 'error');
            this.addMessage('Sorry, there was an error processing your command.', 'assistant');
        }
        
        this.updateStatus('ready', 'Ready to chat');
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
                    Hello! I'm your web assistant. Type a command or click the voice button to get started. 
                    <br><br>Try: "Go to Google and search for weather"
                </div>
            </div>
        `;
        this.logAction('Chat cleared');
    }

    clearLog() {
        this.actionLog.innerHTML = '';
        this.logAction('Log cleared');
    }

    openSettings() {
        this.logAction('Settings clicked');
        // TODO: Implement settings panel
        this.addMessage('Settings panel coming soon!', 'assistant');
    }
}

// Initialize the assistant when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WebAssistantChat();
});