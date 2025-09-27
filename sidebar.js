class VoiceWebAssistant {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.currentMode = 'basic'; // 'basic' or 'autonomous'
        this.aiConfigured = false;
        this.initializeElements();
        this.initializeVoiceRecognition();
        this.setupEventListeners();
        this.setupMessageListener();
        this.checkAIStatus();
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
        
        // AI Configuration elements
        this.aiConfigSection = document.getElementById('aiConfigSection');
        this.configStatus = document.getElementById('configStatus');
        this.aiStatusText = document.getElementById('aiStatusText');
        this.configureAiBtn = document.getElementById('configureAiBtn');
        this.aiConfigForm = document.getElementById('aiConfigForm');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
        this.cancelConfigBtn = document.getElementById('cancelConfigBtn');
        
        // Mode selection elements
        this.basicModeBtn = document.getElementById('basicModeBtn');
        this.autonomousModeBtn = document.getElementById('autonomousModeBtn');
        
        // Agent progress elements
        this.agentProgress = document.getElementById('agentProgress');
        this.progressText = document.getElementById('progressText');
        this.progressFill = document.getElementById('progressFill');
        this.progressSteps = document.getElementById('progressSteps');
        this.stopAgentBtn = document.getElementById('stopAgentBtn');
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
        
        // AI Configuration event listeners
        this.configureAiBtn.addEventListener('click', () => this.showAIConfig());
        this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        this.cancelConfigBtn.addEventListener('click', () => this.hideAIConfig());
        
        // Mode selection event listeners
        this.basicModeBtn.addEventListener('click', () => this.switchMode('basic'));
        this.autonomousModeBtn.addEventListener('click', () => this.switchMode('autonomous'));
        
        // Agent control event listeners
        this.stopAgentBtn.addEventListener('click', () => this.stopAutonomousAgent());
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
            
            let response;
            
            if (this.currentMode === 'autonomous' && this.aiConfigured) {
                // Use autonomous AI agent
                response = await chrome.runtime.sendMessage({
                    type: 'PROCESS_AUTONOMOUS_GOAL',
                    goal: command
                });
                
                if (response && response.success && response.result) {
                    this.updateAiResponse(response.aiResponse);
                    
                    if (response.result.requiresWebInteraction === false) {
                        // Simple query, no action needed
                        this.updateStatus('ready', 'Ready for next command');
                        return;
                    }
                    
                    // Show agent progress for autonomous mode
                    this.showAgentProgress();
                }
            } else {
                // Use basic voice command processing
                response = await chrome.runtime.sendMessage({
                    type: 'PROCESS_COMMAND',
                    command: command
                });
                
                if (response && response.success) {
                    this.updateAiResponse(response.aiResponse);
                    // Execute the action via content script for basic mode
                    await this.executeAction(response.action);
                }
            }
            
            if (response && response.requiresConfiguration) {
                // Show AI configuration if needed
                this.showAIConfig();
            } else if (!response || !response.success) {
                this.updateAiResponse('Sorry, I couldn\'t understand that command.');
                this.logAction('Command processing failed', 'error');
            }
            
        } catch (error) {
            this.logAction(`Error processing command: ${error.message}`, 'error');
            this.updateAiResponse('Sorry, there was an error processing your command.');
        }
        
        if (this.currentMode !== 'autonomous') {
            this.updateStatus('ready', 'Ready for next command');
        }
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
        alert('Settings functionality coming soon! For now, use the AI Configuration section above to set up autonomous mode.');
    }

    // AI Configuration methods
    async checkAIStatus() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                const response = await chrome.runtime.sendMessage({ type: 'GET_AI_STATUS' });
                if (response && response.success) {
                    this.updateAIStatus(response.aiInitialized, response.agentActive);
                }
            }
        } catch (error) {
            console.log('Could not check AI status:', error.message);
        }
    }

    updateAIStatus(aiInitialized, agentActive = false) {
        this.aiConfigured = aiInitialized;
        
        if (aiInitialized) {
            this.aiStatusText.textContent = '✅ AI Configured';
            this.configureAiBtn.textContent = 'Reconfigure';
            this.autonomousModeBtn.disabled = false;
        } else {
            this.aiStatusText.textContent = '❌ AI Not Configured';
            this.configureAiBtn.textContent = 'Configure AI';
            this.autonomousModeBtn.disabled = true;
            this.switchMode('basic');
        }

        if (agentActive) {
            this.showAgentProgress();
        } else {
            this.hideAgentProgress();
        }
    }

    showAIConfig() {
        this.aiConfigForm.style.display = 'block';
        this.apiKeyInput.focus();
    }

    hideAIConfig() {
        this.aiConfigForm.style.display = 'none';
        this.apiKeyInput.value = '';
    }

    async saveApiKey() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (!apiKey) {
            alert('Please enter a valid API key');
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CONFIGURE_AI',
                apiKey: apiKey
            });

            if (response && response.success) {
                this.updateAIStatus(true);
                this.hideAIConfig();
                this.logAction('AI configured successfully', 'info');
                this.updateAiResponse('AI is now configured! You can switch to Autonomous AI mode.');
            } else {
                alert(response?.message || 'Failed to configure AI. Please check your API key.');
                this.logAction('AI configuration failed', 'error');
            }
        } catch (error) {
            alert('Error configuring AI: ' + error.message);
            this.logAction('AI configuration error: ' + error.message, 'error');
        }
    }

    // Mode switching methods
    switchMode(mode) {
        if (mode === 'autonomous' && !this.aiConfigured) {
            alert('Please configure AI first to use Autonomous mode');
            return;
        }

        this.currentMode = mode;
        
        // Update UI
        this.basicModeBtn.classList.toggle('active', mode === 'basic');
        this.autonomousModeBtn.classList.toggle('active', mode === 'autonomous');

        // Update instructions
        if (mode === 'autonomous') {
            this.transcript.innerHTML = 'Autonomous AI Mode: Describe your goal naturally<br>e.g., "Go to Amazon and buy wireless headphones under $50"';
            this.updateAiResponse('🤖 Autonomous AI Mode activated! Describe your goal and I\'ll break it down into steps and execute them.');
        } else {
            this.transcript.innerHTML = 'Say something like "Go to Google and search for weather"';
            this.updateAiResponse('Basic Voice Mode: I can help with simple commands like navigation, search, clicking, and typing.');
        }

        this.logAction(`Switched to ${mode} mode`, 'info');
    }

    // Agent progress methods
    showAgentProgress() {
        this.agentProgress.style.display = 'block';
        this.updateAgentProgress('Starting autonomous agent...', 0, 0, 1);
    }

    hideAgentProgress() {
        this.agentProgress.style.display = 'none';
    }

    updateAgentProgress(text, currentStep, totalSteps, progressPercent = 0) {
        this.progressText.textContent = text;
        this.progressSteps.textContent = `Step ${currentStep} of ${totalSteps}`;
        this.progressFill.style.width = `${Math.max(0, Math.min(100, progressPercent))}%`;
    }

    async stopAutonomousAgent() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'STOP_AUTONOMOUS_AGENT'
            });
            
            if (response && response.success) {
                this.hideAgentProgress();
                this.updateAiResponse('Autonomous agent stopped.');
                this.logAction('Autonomous agent stopped by user', 'warning');
                this.updateStatus('ready', 'Ready for next command');
            }
        } catch (error) {
            this.logAction('Error stopping agent: ' + error.message, 'error');
        }
    }
}

// Initialize the assistant when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceWebAssistant();
});