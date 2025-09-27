document.addEventListener('DOMContentLoaded', () => {
    const openSidebarBtn = document.getElementById('openSidebarBtn');
    
    openSidebarBtn.addEventListener('click', async () => {
        try {
            // Get the current window
            const currentWindow = await chrome.windows.getCurrent();
            
            // Open the side panel for the current window
            await chrome.sidePanel.open({ windowId: currentWindow.id });
            
            // Close the popup
            window.close();
        } catch (error) {
            console.error('Error opening sidebar:', error);
            
            // Fallback: Send message to background script
            try {
                await chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' });
                window.close();
            } catch (fallbackError) {
                console.error('Fallback failed:', fallbackError);
                alert('Unable to open sidebar. Please try clicking the extension icon again.');
            }
        }
    });
});