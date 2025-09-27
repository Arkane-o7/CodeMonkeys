class VoiceWebAssistant {
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
        this.startVoiceBtn = document.getElementById('startVoiceBtn');
        this.stopVoiceBtn = document.getElementById('stopVoiceBtn');
        this.transcript = document.getElementById('transcript');
        this.aiResponse = document.getElementById('aiResponse');
        this.actionLog = document.getElementById('actionLog');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
    }

    initializeVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                this.updateStatus('listening', 'Listening...');
                this.isListening = true;
                this.startVoiceBtn.disabled = true;
                this.stopVoiceBtn.disabled = false;
            };
            
            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                this.transcript.textContent = finalTranscript + interimTranscript;
                
                if (finalTranscript) {
                    this.processVoiceCommand(finalTranscript.trim());
                }
            };
            
            this.recognition.onerror = (event) => {
                this.logAction(`Voice recognition error: ${event.error}`, 'error');
                this.stopListening();
            };
            
            this.recognition.onend = () => {
                this.stopListening();
            };
        } else {
            this.logAction('Speech recognition not supported in this browser', 'error');
        }
    }

    setupEventListeners() {
        this.startVoiceBtn.addEventListener('click', () => this.startListening());
        this.stopVoiceBtn.addEventListener('click', () => this.stopListening());
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.settingsBtn.addEventListener('click', () => this.openSettings());
    }

    setupMessageListener() {
        // Check if we're in an extension context
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'ACTION_COMPLETED') {
                    this.logAction(message.description);
                    this.updateAiResponse(message.response || 'Action completed');
                } else if (message.type === 'ACTION_ERROR') {
                    this.logAction(message.description, 'error');
                    this.updateAiResponse('Error: ' + message.error);
                } else if (message.type === 'CONTENT_LOG') {
                    this.logAction(message.message);
                }
            });
        } else {
            // Not in extension context - show demo mode
            this.logAction('Demo mode - Extension features disabled outside of Chrome extension context', 'warning');
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
        this.updateStatus('ready', 'Ready to listen');
        this.isListening = false;
        this.startVoiceBtn.disabled = false;
        this.stopVoiceBtn.disabled = true;
    }

    async processVoiceCommand(command) {
        this.updateStatus('processing', 'Processing command...');
        this.updateAiResponse('Processing your request...');
        
        this.logAction(`User said: "${command}"`);
        
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
                this.updateAiResponse(response.aiResponse);
                // Execute the action via content script
                await this.executeAction(response.action);
            } else {
                this.updateAiResponse('Sorry, I couldn\'t understand that command.');
                this.logAction('Command processing failed', 'error');
            }
        } catch (error) {
            this.logAction(`Error processing command: ${error.message}`, 'error');
            this.updateAiResponse('Sorry, there was an error processing your command.');
        }
        
        this.updateStatus('ready', 'Ready for next command');
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

    updateAiResponse(response) {
        this.aiResponse.textContent = response;
        
        // Use text-to-speech to read the response
        this.speakText(response);
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

    clearLog() {
        this.actionLog.innerHTML = '';
        this.logAction('Log cleared');
    }

    openSettings() {
        this.logAction('Settings clicked');
        // TODO: Implement settings panel
        alert('Settings panel coming soon!');
    }
}

// Initialize the assistant when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceWebAssistant();
});