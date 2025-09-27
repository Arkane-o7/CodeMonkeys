# AI Configuration Guide

## Enhanced Autonomous AI Web Agent Setup

This guide will help you configure the Enhanced Autonomous AI Web Agent with Gemini API integration.

### Prerequisites

1. **Google AI Studio Account**: You need access to Google's Gemini AI API
2. **API Key**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

### Step-by-Step Setup

#### 1. Get Your Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key (keep it secure!)

#### 2. Configure the Extension

1. Open the Voice Web Assistant extension sidebar
2. In the "🤖 AI Configuration" section, click "Configure AI"
3. Paste your Gemini API key in the input field
4. Click "Save"
5. You should see "✅ AI Configured" status

#### 3. Using Autonomous Mode

1. Click the "Autonomous AI" mode button (it will be enabled after AI configuration)
2. Start voice recognition
3. Describe your goal naturally, for example:
   - "Go to Amazon and buy wireless headphones under $50"
   - "Search for restaurants near me and make a reservation"
   - "Find the latest news about artificial intelligence"

#### 4. Understanding the Workflow

The autonomous agent follows this process:

1. **Observe**: Analyzes the current webpage and its elements
2. **Decide**: Uses AI to determine the best action to take
3. **Act**: Executes the action (click, type, navigate, etc.)
4. **Verify**: Confirms the action worked as expected
5. **Update Context**: Remembers what was done for future steps

### Features

#### Task Decomposition
- Breaks down complex goals into actionable steps
- Creates logical sequence of actions

#### Web Perception
- Analyzes HTML and identifies interactive elements
- Understands page structure and content

#### Contextual Memory
- Maintains memory of actions taken
- Uses context to make better decisions

#### Intelligent Verification
- Predicts expected outcomes
- Verifies if actions succeeded

#### Error Recovery
- Attempts to recover from failures
- Can re-orient when lost
- Asks for user help when needed

### Example Goals

**Shopping:**
- "Buy a book about machine learning from Amazon"
- "Find and purchase a laptop under $800"

**Research:**
- "Research the weather forecast for next week"
- "Find articles about sustainable energy"

**Navigation:**
- "Go to my bank account and check my balance"
- "Navigate to YouTube and find cooking tutorials"

**Forms:**
- "Fill out this contact form with my information"
- "Sign up for this newsletter"

### Important Notes

⚠️ **Security**: Never share your API key. The extension stores it locally in your browser.

⚠️ **Limitations**: 
- Some websites may block automated interactions
- Complex forms may require manual assistance
- Always review actions before providing sensitive information

⚠️ **Cost**: Using the Gemini API may incur costs based on your usage. Check Google's pricing.

### Troubleshooting

#### "AI Service not configured" Error
- Make sure you've entered a valid Gemini API key
- Check that your API key has proper permissions

#### "Extension context not available" Error
- Make sure you're using the extension in a Chrome/Chromium browser
- Try refreshing the page and reopening the sidebar

#### Actions Not Working
- Some websites may block content scripts
- Try the same action on a different website (Google.com works well for testing)
- Check the action log for error messages

#### API Quota Exceeded
- You may have exceeded your Gemini API quota
- Check your Google AI Studio dashboard for usage

### Support

For issues or questions:
1. Check the action log in the extension for error messages
2. Try switching to Basic Voice mode if Autonomous mode fails
3. Clear the log and try a simpler goal first

### Development Notes

This is an enhanced version of the original Voice Web Assistant with added AI capabilities. The core architecture includes:

- `ai-service.js`: Handles Gemini API integration
- `autonomous-agent.js`: Implements the Observe → Decide → Act → Verify loop
- Enhanced content script with expanded web automation capabilities
- Updated UI with mode selection and progress tracking

For developers interested in extending this system, the modular design allows for easy addition of new AI providers, action types, and verification methods.