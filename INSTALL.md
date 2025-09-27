# Installation Guide - Voice Web Assistant

## 📋 Prerequisites

- Chrome/Chromium browser (version 88+) or Firefox (version 89+)
- Microphone access for voice commands
- Enable microphone permissions for the browser

## 🚀 Installation Steps

### For Chrome/Chromium:

1. **Download the Extension**
   - Clone this repository or download as ZIP
   - Extract if downloaded as ZIP

2. **Enable Developer Mode**
   - Open Chrome and navigate to `chrome://extensions/`
   - Toggle "Developer mode" in the top right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Select the entire extension folder (containing `manifest.json`)
   - The Voice Web Assistant should appear in your extensions list

4. **Pin the Extension (Optional)**
   - Click the puzzle piece icon in the toolbar
   - Find "Voice Web Assistant" and click the pin icon

### For Firefox:

1. **Download the Extension**
   - Clone this repository or download as ZIP
   - Extract if downloaded as ZIP

2. **Load Temporarily**
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox" on the left sidebar
   - Click "Load Temporary Add-on"
   - Navigate to the extension folder and select `manifest.json`

> **Note**: Firefox temporary extensions are removed when the browser restarts. For permanent installation, the extension needs to be signed by Mozilla.

## 🎤 First Time Setup

1. **Grant Permissions**
   - When you first install, Chrome may ask for permissions
   - Allow microphone access when prompted
   - Grant access to "all sites" for full functionality

2. **Test Voice Recognition**
   - Click the Voice Web Assistant icon in your toolbar
   - Click "Open Voice Assistant" to open the sidebar
   - Click "Start Listening" and say "Hello"
   - You should see your words appear in the transcript

3. **Test a Basic Command**
   - Try saying "Go to Google"
   - The extension should navigate to Google.com
   - Watch for the visual feedback and listen for audio confirmation

## 🔧 Troubleshooting

### Microphone Not Working
- Check browser microphone permissions in Settings
- Ensure microphone is not muted or being used by another app
- Try refreshing the page and clicking "Start Listening" again

### Extension Not Loading
- Ensure all files are in the same folder with `manifest.json`
- Check Chrome Extensions page for error messages
- Verify you're using a supported browser version

### Commands Not Working
- Speak clearly and at normal pace
- Ensure you're on a website where the command makes sense
- Check the action log in the sidebar for error messages

### Visual Feedback Not Showing
- The content script needs to inject into the page
- Try refreshing the webpage after installing the extension
- Some sites may block content scripts (check console for errors)

## 🛠️ Development Mode

If you want to modify the extension:

1. **Make Changes**
   - Edit any of the source files
   - Save your changes

2. **Reload Extension**
   - Go to `chrome://extensions/`
   - Find "Voice Web Assistant"
   - Click the refresh/reload icon

3. **Test Changes**
   - Open a new tab or refresh existing tabs
   - Test your modifications

## 🔐 Permissions Explained

The extension requires these permissions:

- **activeTab**: Access the current tab to perform actions
- **sidePanel**: Create the voice interface sidebar
- **scripting**: Inject scripts for webpage interaction
- **storage**: Save user preferences and settings
- **tts**: Text-to-speech for audio feedback
- **host_permissions**: Access all websites for universal functionality

## 📱 Browser Compatibility

### Supported:
- ✅ Chrome 88+
- ✅ Chromium 88+
- ✅ Microsoft Edge 88+
- ✅ Firefox 89+ (temporary installation)

### Not Supported:
- ❌ Safari (lacks Web Speech API support)
- ❌ Internet Explorer
- ❌ Older browser versions

## 🎯 Next Steps

Once installed, check out the main README.md for:
- Complete list of voice commands
- Usage examples and workflows
- Feature explanations
- Development guidelines

Happy voice-controlled browsing! 🎤✨