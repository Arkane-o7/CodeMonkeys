// Add agent classes to background script
// This file includes all the agent classes inline since Chrome extensions
// can't import ES modules in service workers

// Include all agent classes directly
const scripts = [
    'gemini-service.js',
    'dom-analyzer.js', 
    'web-automation.js',
    'error-handler.js',
    'user-interaction.js',
    'web-agent.js'
];

// Import scripts in background context
if (typeof importScripts === 'function') {
    try {
        importScripts(...scripts);
        console.log('Agent classes loaded successfully');
    } catch (error) {
        console.error('Failed to load agent classes:', error);
    }
}