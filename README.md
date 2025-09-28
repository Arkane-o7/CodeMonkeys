# Voice Web Assistant - Browser Extension

**DevJam Project 2025 | Browser MCP Automation**

A browser extension that provides voice-controlled web accessibility for visually impaired users. Control websites through natural voice commands while watching the AI perform actions in real-time.

## 🎯 Features

- **Voice Control**: Speak natural commands to control websites
- **Real-time Visual Feedback**: Watch every action as it happens
- **Text-to-Speech Narration**: Hear what's happening on the page
- **Accessibility Focused**: Designed for visually impaired users
- **Live Action Execution**: See clicking, typing, scrolling in real-time
- **Smart Element Detection**: AI finds the right elements to interact with

## 🚀 Installation

### For Chrome/Chromium Browsers:

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the extension folder
5. The Voice Web Assistant icon should appear in your toolbar

## 🔑 Gemini API Key Setup

The autonomous agent requires a Gemini API key. For local testing you can embed it directly in the extension:

1. Open `config.js`
2. Replace `YOUR_GEMINI_API_KEY_HERE` with your actual key from [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Reload the unpacked extension in your browser

> ⚠️ **Security reminder:** Hardcoding secrets is only safe for private, local use. Remove or replace the key with a placeholder before committing or pushing code to any remote repository.

### For Firefox:

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the extension folder

## 🎤 Usage

### Getting Started:
1. Click the Voice Web Assistant icon in your browser toolbar
2. Click "Open Voice Assistant" to open the sidebar
3. Click "Start Listening" and begin speaking commands

### Voice Commands:

#### Navigation:
- "Go to Google"
- "Navigate to Amazon"
- "Open YouTube"

#### Search:
- "Search for wireless headphones"
- "Find cat videos"
- "Look for restaurants near me"

#### Interaction:
- "Click on login button"
- "Press the search button"
- "Select the first result"

#### Input:
- "Type my email address"
- "Enter john.doe@email.com"
- "Input password"

#### Page Control:
- "Scroll down"
- "Scroll up"

### Example Workflow:
1. **User**: "Go to Amazon and buy headphones"
2. **System**: "Navigating to Amazon..." [user sees browser go to Amazon]
3. **System**: "Typing 'headphones' in search..." [user sees typing animation]
4. **System**: "Clicking search button..." [user sees click highlight]
5. **System**: "Found 1,247 results for headphones"

## 🏗️ Technical Architecture

### Extension Components:

- **`manifest.json`**: Extension configuration and permissions
- **`sidebar.html/js/css`**: Voice interface and status display
- **`content-script.js`**: Webpage manipulation and visual feedback
- **`background.js`**: Coordinates communication and command processing
- **`popup.html/js`**: Quick access controls

### Key Technologies:

- **Web Speech API**: Voice recognition in sidebar
- **Chrome Extensions API**: Cross-component communication
- **DOM Manipulation**: Real-time webpage interaction
- **Text-to-Speech**: Audio narration feedback
- **CSS Animations**: Visual highlighting and feedback

## 🎨 Visual Feedback System

The extension provides rich visual feedback to help users understand what's happening:

- **Orange highlights**: Elements about to be interacted with
- **Green backgrounds**: Text input fields being typed into
- **Click animations**: Visual confirmation of button presses
- **Smooth scrolling**: Animated page movement
- **Loading indicators**: Status updates in top-right corner

## 🛠️ Development

### File Structure:
```
├── manifest.json          # Extension configuration
├── sidebar.html           # Voice interface
├── sidebar.js             # Voice recognition logic
├── sidebar.css            # UI styling
├── content-script.js      # Page manipulation
├── content-styles.css     # Page styling
├── background.js          # Background coordination
├── popup.html             # Quick access popup
├── popup.js               # Popup logic
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Browser Permissions:
- `activeTab`: Access current webpage
- `sidePanel`: Create sidebar interface
- `scripting`: Inject content scripts
- `storage`: Save user preferences
- `tts`: Text-to-speech capabilities
- `host_permissions`: Access all websites

## 🔒 Privacy & Security

- No data is sent to external servers
- Voice processing happens locally in browser
- No personal information is stored
- Commands are processed client-side only
- Avoid committing real API keys. When sharing or pushing the code, replace the key in `config.js` with a placeholder and regenerate it if it has already been exposed.

## � Troubleshooting

- **Gemini API 503 Service Unavailable** – The Google AI service occasionally rate-limits or pauses the `generateContent` endpoint. The extension will retry automatically with exponential backoff and surface a friendly message if all attempts fail. Wait 10–20 seconds, then run the command again. Persistent 503 responses usually clear up after a short cool-down period.
- **Gemini API 404 Model Not Found** – Google periodically rotates model identifiers. The extension now falls back through `gemini-1.5-flash-latest`, `gemini-1.5-flash`, and `gemini-pro`. If all fail, visit Google AI Studio → *Models* to confirm the IDs available to your API key, then add the preferred model name to `initializeModelCandidates` in `gemini-service.js`.

## �🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in Chrome/Firefox
5. Submit a pull request

## 📝 License

This project is open source and available under the MIT License.

## 🎯 Target Users

- Visually impaired individuals seeking independent web access
- Users with motor impairments who prefer voice control
- Anyone wanting hands-free browsing capabilities
- Accessibility advocates and developers

## 🔮 Future Enhancements

- AI-powered command interpretation (OpenAI/Claude integration)
- Advanced element recognition
- Custom voice commands
- Multi-language support
- Integration with screen readers
- Gesture control support

---

**Making the web accessible through voice, one command at a time.** 🎤✨
