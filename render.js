/**
 * TranslationManager class handles the translation process, including activating/deactivating the plugin,
 * sending translation requests, handling text selections, showing translation popups, and managing settings.
 */

/**
 * Manages the translation process for the BPT-Pro-Libretranslate Chrome extension.
 * Handles plugin activation, text selection, translation requests, popups, and settings.
 */
class TranslationManager {
    /**
     * Initializes the TranslationManager with default state and properties.
     */
    constructor() {
        /**
         * State object containing configuration and status of the plugin.
         * @type {Object}
         */
        this.state = {
            apiUrl: '', // URL for the translation API
            apiKey: '', // API key for authentication
            isTranslationSent: false, // Tracks if a translation request is sent
            isPluginActive: false, // Indicates if the plugin is active
            currentTargetLanguage: 'en', // Default target language for translation
            shortcuts: {
                activate: 'A', // Shortcut key to activate plugin
                deactivate: 'K', // Shortcut key to deactivate plugin
                testConnection: 'T', // Shortcut key to test API connection
                toggle: 'G', // Shortcut key to toggle plugin status
            }
        };
        /**
         * Available languages for translation with their codes and names.
         * @type {Object}
         */
        this.availableLanguages = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            ja: 'Japanese',
            zh: 'Chinese',
            ar: 'Arabic'
        };
        this.rateLimitPopup = null; // Reference to rate limit popup element
        this.rateLimitMessageDiv = null; // Reference to rate limit message div
        this.rateLimitInfoDiv = null; // Reference to rate limit info div
        this.rateLimitCloseBtn = null; // Reference to rate limit close button
        this.rateLimitTimeout = null; // Timeout for rate limit popup
        this.init(); // Initialize the manager
    }

    /**
     * Sets up the initial state by loading configurations and setting up listeners.
     */
    init() {
        this.loadState();
        this.setupListeners();
        this.setupKeyboardShortcuts();
    }

    /**
     * Loads saved state from chrome.storage.local.
     */
    loadState() {
        chrome.storage.local.get(['isPluginActive', 'targetLanguage', 'shortcuts'], (result) => {
            this.state.isPluginActive = result.isPluginActive || false;
            this.state.currentTargetLanguage = result.targetLanguage || 'en';
            if (result.shortcuts) {
                this.state.shortcuts = { ...this.state.shortcuts, ...result.shortcuts };
            }
            const shortcutToggle = document.getElementById('shortcutToggle');
            if (shortcutToggle) {
                shortcutToggle.value = this.state.shortcuts.toggle;
            }
        });
    }

    /**
     * Sets up event listeners for text selection, storage changes, and messages.
     */
    setupListeners() {
        document.addEventListener('selectionchange', () => {
            this.state.isTranslationSent = false; // Reset translation sent status
        });
        document.addEventListener('mouseup', () => this.handleTextSelection());
        chrome.storage.onChanged.addListener((changes) => this.handleStorageChanges(changes));
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessages(message);
        });
    }

    /**
     * Handles changes in chrome.storage.local.
     * @param {Object} changes - Object containing changed storage keys and values.
     */
    handleStorageChanges(changes) {
        if (changes.isPluginActive) {
            this.state.isPluginActive = changes.isPluginActive.newValue;
        }
        if (changes.targetLanguage) {
            this.state.currentTargetLanguage = changes.targetLanguage.newValue;
        }
        if (changes.shortcuts) {
            this.state.shortcuts = { ...this.state.shortcuts, ...changes.shortcuts.newValue };
        }
    }

    /**
     * Processes incoming messages from chrome.runtime.
     * @param {Object} message - The message object containing action and data.
     */
    handleMessages(message) {
        if (message.action === 'updatePluginStatus') {
            this.state.isPluginActive = message.isActive;
        } else if (message.action === 'showMessage') {
            this.showRateLimitPopup(message.message, message.type);
        } else if (message.action === 'rateLimitUpdate') {
            this.updateRateLimitInfo(message.remainingRequests, message.waitTime);
        }
    }

    /**
     * Sets up keyboard shortcuts for plugin actions.
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.altKey) {
                switch (event.key.toUpperCase()) {
                    case this.state.shortcuts.activate:
                        this.togglePluginStatus(true);
                        break;
                    case this.state.shortcuts.deactivate:
                        this.togglePluginStatus(false);
                        break;
                    case this.state.shortcuts.testConnection:
                        event.preventDefault();
                        const apiTestPopup = new ApiTestPopup();
                        apiTestPopup.createApiTestListPopup();
                        break;
                    case this.state.shortcuts.toggle:
                        this.togglePluginStatus();
                        break;
                }
            }
        });
    }

    /**
     * Handles text selection for translation when the plugin is active.
     */
    async handleTextSelection() {
        if (!this.state.isPluginActive) return;
        const selectedText = window.getSelection().toString().trim();
        if (!selectedText || this.state.isTranslationSent) return;
        try {
            const config = await this.getConfiguration();
            if (!config.apiUrl || !config.apiKey) {
                this.createErrorPopup("Please configure the API URL and API Key in the settings.");
                return;
            }
            this.sendTranslationRequest(selectedText, config);
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Retrieves configuration from chrome.storage.local.
     * @returns {Promise<Object>} Configuration object.
     */
    async getConfiguration() {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get(
                    ['targetLanguage', 'apiUrl', 'apiKey', 'isPluginActive', 'shortcuts'],
                    (result) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error("Error accessing storage: " + chrome.runtime.lastError.message));
                        } else {
                            resolve({
                                targetLanguage: this.state?.currentTargetLanguage || result.targetLanguage || 'en',
                                apiUrl: result.apiUrl || '',
                                apiKey: result.apiKey || '',
                                isPluginActive: result.isPluginActive,
                                shortcuts: result.shortcuts,
                            });
                        }
                    }
                );
            } catch (error) {
                reject(new Error("Extension context invalidated or unexpected error occurred."));
            }
        });
    }

    /**
     * Sends a translation request to the background script.
     * @param {string} text - Text to translate.
     * @param {Object} config - Configuration object.
     */
    async sendTranslationRequest(text, config) {
        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'translate',
                    text: text,
                    targetLanguage: config.targetLanguage,
                    apiUrl: config.apiUrl,
                    apiKey: config.apiKey,
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
            if (response && response.translatedText) {
                this.showTranslationPopup(response.translatedText, text);
                this.state.isTranslationSent = true;
            } else {
                throw new Error(response?.error?.message || 'Unknown translation error');
            }
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Displays a popup with the translated text.
     * @param {string} translatedText - Translated text to display.
     * @param {string} originalText - Original selected text.
     */
    showTranslationPopup(translatedText, originalText) {
        const popup = this.createPopup(translatedText, originalText);
        this.applyPopupStyles(popup);
        const languageSelector = popup.querySelector('.language-selector');
        languageSelector.addEventListener('change', async (e) => {
            try {
                const newText = await this.retranslateText(popup, e.target.value);
                popup.querySelector('p').textContent = newText;
                this.resetPopupTimeout(popup);
            } catch (error) {
                popup.querySelector('p').textContent = 'Translation error: ' + error.message;
            }
        });
        const closeButton = popup.querySelector('.close-btn');
        closeButton.addEventListener('click', () => popup.remove());
        document.body.appendChild(popup);
        this.setPopupTimeout(popup);
    }

    /**
     * Creates a translation popup element.
     * @param {string} translatedText - Translated text to display.
     * @param {string} originalText - Original selected text.
     * @returns {HTMLElement} Popup element.
     */
    createPopup(translatedText, originalText) {
        const popup = document.createElement('div');
        popup.className = 'translation-popup';
        popup.dataset.originalText = originalText;
        popup.innerHTML = `
            <div class="popup-content">
                <div class="popup-header">
                    <select class="language-selector">
                        ${Object.entries(this.availableLanguages)
            .map(([code, name]) =>
                `<option value="${code}" ${code === this.state.currentTargetLanguage ? 'selected' : ''}>${name}</option>`)
            .join('')}
                    </select>
                    <button class="close-btn">×</button>
                </div>
                <p>${translatedText}</p>
            </div>
        `;
        return popup;
    }

    /**
     * Applies styles to the translation popup, centering it and enabling dragging.
     * @param {HTMLElement} popup - The popup element to style.
     */
    applyPopupStyles(popup) {
        Object.assign(popup.style, {
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
            padding: '20px',
            borderRadius: '8px',
            zIndex: '10000',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            minWidth: '250px',
            maxWidth: '40%',
            cursor: 'move'
        });
        const popupContent = popup.querySelector('.popup-content');
        popupContent.style.position = 'relative';
        const popupHeader = popup.querySelector('.popup-header');
        Object.assign(popupHeader.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
        });
        const languageSelector = popup.querySelector('.language-selector');
        Object.assign(languageSelector.style, {
            padding: '5px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            background: '#f5f5f5',
            color: '#333'
        });
        const closeButton = popup.querySelector('.close-btn');
        Object.assign(closeButton.style, {
            backgroundColor: 'transparent',
            color: '#fff',
            border: 'none',
            fontSize: '24px',
            lineHeight: '20px',
            cursor: 'pointer',
            padding: '0 5px',
            fontWeight: 'bold',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        closeButton.addEventListener('mouseover', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });
        closeButton.addEventListener('mouseout', () => {
            closeButton.style.backgroundColor = 'transparent';
        });
        const paragraph = popup.querySelector('p');
        Object.assign(paragraph.style, {
            margin: '0',
            fontSize: '16px',
            lineHeight: '1.5',
            wordBreak: 'break-word'
        });
        this.enableDragging(popup, closeButton);
    }

    /**
     * Retranslates the original text to a new language.
     * @param {HTMLElement} popup - The popup containing the original text.
     * @param {string} newLanguage - The new target language code.
     * @returns {Promise<string>} The translated text.
     */
    async retranslateText(popup, newLanguage) {
        const originalText = popup.dataset.originalText;
        const config = await this.getConfiguration();
        config.targetLanguage = newLanguage;
        this.state.currentTargetLanguage = newLanguage;
        chrome.storage.local.set({ targetLanguage: newLanguage }, () => {
            if (chrome.runtime.lastError) {
                throw new Error("Error saving language preference: " + chrome.runtime.lastError.message);
            }
        });
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'translate',
                text: originalText,
                targetLanguage: newLanguage,
                apiUrl: config.apiUrl,
                apiKey: config.apiKey,
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        if (response && response.translatedText) {
            return response.translatedText;
        } else {
            throw new Error(response?.error?.message || 'Unknown translation error');
        }
    }

    /**
     * Sets a timeout to remove the popup after 15 seconds.
     * @param {HTMLElement} popup - The popup element.
     */
    setPopupTimeout(popup) {
        popup.timeoutId = setTimeout(() => {
            if (document.body.contains(popup)) {
                popup.remove();
            }
        }, 15000);
    }

    /**
     * Resets the popup timeout.
     * @param {HTMLElement} popup - The popup element.
     */
    resetPopupTimeout(popup) {
        clearTimeout(popup.timeoutId);
        this.setPopupTimeout(popup);
    }

    /**
     * Handles errors by displaying appropriate popups.
     * @param {Error} error - The error object.
     */
    handleError(error) {
        if (error.message.includes('Extension context invalidated') || error.message.includes('Could not establish connection')) {
            this.createErrorPopup("The extension has been updated or reloaded. Please refresh the page to continue using it.");
        } else {
            this.showRateLimitPopup("Error: " + error.message, 'error');
        }
    }

    /**
     * Toggles the plugin's active status.
     * @param {boolean|null} forceState - Optional state to force (true/false), null to toggle.
     */
    togglePluginStatus(forceState = null) {
        this.state.isPluginActive = forceState !== null ? forceState : !this.state.isPluginActive;
        chrome.storage.local.set({ isPluginActive: this.state.isPluginActive }, () => {
            if (chrome.runtime.lastError) {
                this.createErrorPopup("Error updating plugin status: " + chrome.runtime.lastError.message);
            } else {
                this.createSuccessPopup(`Plugin ${this.state.isPluginActive ? 'Activated' : 'Deactivated'}`);
            }
        });
    }

    /**
     * Creates a banner notification.
     * @param {string} message - The message to display.
     * @param {string} [backgroundColor='#ff0000'] - Background color of the banner.
     * @param {string} [textColor='white'] - Text color of the banner.
     */
    createBanner(message, backgroundColor = '#ff0000', textColor = 'white') {
        const banner = document.createElement('div');
        banner.className = 'dynamic-banner';
        Object.assign(banner.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            backgroundColor: backgroundColor,
            color: textColor,
            padding: '10px',
            textAlign: 'center',
            zIndex: '10001',
            fontFamily: 'Arial, sans-serif'
        });
        banner.textContent = message;
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        Object.assign(closeButton.style, {
            marginLeft: '10px',
            background: 'transparent',
            border: 'none',
            color: textColor,
            fontSize: '20px',
            cursor: 'pointer'
        });
        closeButton.addEventListener('click', () => banner.remove());
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh';
        Object.assign(refreshButton.style, {
            marginLeft: '10px',
            padding: '5px 10px',
            background: 'white',
            color: backgroundColor,
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
        });
        refreshButton.addEventListener('click', () => window.location.reload());
        banner.appendChild(refreshButton);
        banner.appendChild(closeButton);
        document.body.appendChild(banner);
        setTimeout(() => {
            if (banner.parentElement) {
                banner.remove();
            }
        }, 5000);
    }

    /**
     * Creates a success notification banner.
     * @param {string} message - The success message to display.
     */
    createSuccessPopup(message) {
        this.createBanner(message, '#28a745', 'white');
    }

    /**
     * Creates an error notification banner.
     * @param {string} message - The error message to display.
     */
    createErrorPopup(message) {
        this.createBanner(message, '#ff0000', 'white');
    }

    /**
     * Creates a rate limit popup if it doesn't exist.
     */
    createRateLimitPopup() {
        if (this.rateLimitPopup) return;
        this.rateLimitPopup = document.createElement('div');
        this.rateLimitPopup.id = 'rate-limit-popup';
        this.rateLimitMessageDiv = document.createElement('div');
        this.rateLimitMessageDiv.id = 'rate-limit-message';
        this.rateLimitInfoDiv = document.createElement('div');
        this.rateLimitInfoDiv.id = 'rate-limit-info';
        this.rateLimitCloseBtn = document.createElement('button');
        this.rateLimitCloseBtn.textContent = '×';
        this.rateLimitPopup.appendChild(this.rateLimitCloseBtn);
        this.rateLimitPopup.appendChild(this.rateLimitMessageDiv);
        this.rateLimitPopup.appendChild(this.rateLimitInfoDiv);
        document.body.appendChild(this.rateLimitPopup);
        this.applyRateLimitPopupStyles();
        this.rateLimitCloseBtn.addEventListener('click', () => this.hideRateLimitPopup());
    }

    /**
     * Applies styles to the rate limit popup, centering it and enabling dragging.
     */
    applyRateLimitPopupStyles() {
        Object.assign(this.rateLimitPopup.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            minHeight: '150px',
            width: '350px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            padding: '15px',
            border: '1px solid #ffffff',
            borderRadius: '5px',
            zIndex: '10000',
            display: 'none',
            boxSizing: 'border-box',
            cursor: 'move'
        });
        Object.assign(this.rateLimitMessageDiv.style, {
            marginTop: '10px',
            wordWrap: 'break-word'
        });
        Object.assign(this.rateLimitInfoDiv.style, {
            marginTop: '10px',
            fontSize: '14px'
        });
        Object.assign(this.rateLimitCloseBtn.style, {
            position: 'absolute',
            top: '5px',
            right: '10px',
            color: '#ffffff',
            fontSize: '20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0'
        });
        this.enableDragging(this.rateLimitPopup, this.rateLimitCloseBtn);
    }

    /**
     * Shows the rate limit popup with a message.
     * @param {string} message - The message to display.
     * @param {string} type - The type of message ('error' or other).
     */
    showRateLimitPopup(message, type) {
        this.createRateLimitPopup();
        this.rateLimitMessageDiv.textContent = message;
        this.rateLimitPopup.style.display = 'block';
        this.rateLimitPopup.style.borderColor = type === 'error' ? '#ff4444' : '#ffffff';
        this.rateLimitInfoDiv.textContent = '';
    }

    /**
     * Hides the rate limit popup and clears its content.
     */
    hideRateLimitPopup() {
        if (this.rateLimitPopup) {
            this.rateLimitPopup.style.display = 'none';
            this.rateLimitMessageDiv.textContent = '';
            this.rateLimitInfoDiv.textContent = '';
        }
        if (this.rateLimitTimeout) {
            clearTimeout(this.rateLimitTimeout);
            this.rateLimitTimeout = null;
        }
    }

    /**
     * Updates the rate limit information in the popup.
     * @param {number} remainingRequests - Number of remaining API requests.
     * @param {number|null} waitTime - Time to wait before more requests are available.
     */
    updateRateLimitInfo(remainingRequests, waitTime) {
        if (!this.rateLimitPopup || this.rateLimitPopup.style.display !== 'block') return;
        if (waitTime !== null) {
            this.rateLimitInfoDiv.textContent = `Remaining requests: ${remainingRequests}. Wait ${waitTime} seconds.`;
            if (waitTime <= 0) {
                this.hideRateLimitPopup();
            }
        } else {
            this.rateLimitInfoDiv.textContent = `Remaining requests: ${remainingRequests}.`;
        }
    }

    /**
     * Enables dragging for a popup, constraining it within viewport margins.
     * @param {HTMLElement} popup - The popup element to make draggable.
     * @param {HTMLElement} closeButton - The close button to exclude from dragging.
     */
    enableDragging(popup, closeButton) {
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX;
        let initialY;

        popup.addEventListener('mousedown', (e) => {
            // Prevent dragging if clicking on close button, select element, or their descendants
            if (e.target === closeButton || closeButton.contains(e.target) ||
                e.target.tagName === 'SELECT' || e.target.closest('.language-selector')) {
                return;
            }
            initialX = e.clientX - currentX;
            initialY = e.clientY - currentY;
            isDragging = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                const popupRect = popup.getBoundingClientRect();
                const margin = 10;
                const maxX = window.innerWidth - popupRect.width - margin;
                const maxY = window.innerHeight - popupRect.height - margin;
                const minX = margin;
                const minY = margin;

                currentX = Math.max(minX, Math.min(currentX, maxX));
                currentY = Math.max(minY, Math.min(currentY, maxY));

                popup.style.left = `${currentX}px`;
                popup.style.top = `${currentY}px`;
                popup.style.transform = 'none';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
}


/**
 * Manages the API test popup interface for the BPT-Pro-Libretranslate Chrome extension.
 * Provides functionality to add, test, and remove API configurations, and view test history.
 */
class ApiTestPopup {
    /**
     * Initializes the ApiTestPopup with empty API list and test history.
     */
    constructor() {
        this.apiList = []; // List of API configurations
        this.testHistory = []; // History of API test results
        this.loadFromCache(); // Load saved data from localStorage
    }

    /**
     * Creates and displays the API test popup with tabs for API list and test history, enabling dragging.
     */
    createApiTestListPopup() {
        /**
         * Create the main popup container
         */
        const popupContainer = document.createElement('div');
        Object.assign(popupContainer.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#2d2d2d',
            color: '#fff',
            padding: '25px',
            borderRadius: '12px',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
            width: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
            zIndex: '10000',
            fontFamily: 'Arial, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            cursor: 'move'
        });

        /**
         * Create and style the popup title
         */
        const title = document.createElement('h2');
        title.textContent = 'API Test Manager LibreTranslate';
        Object.assign(title.style, {
            margin: '0 0 10px 0',
            textAlign: 'center',
            color: '#fff',
            fontSize: '24px',
            fontWeight: 'bold'
        });

        /**
         * Create and style the close button
         */
        const closeButton = document.createElement('button');
        closeButton.textContent = '✕';
        Object.assign(closeButton.style, {
            position: 'absolute',
            top: '15px',
            right: '15px',
            background: 'transparent',
            color: '#aaa',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '5px 10px',
            borderRadius: '4px',
            transition: 'all 0.2s'
        });
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            closeButton.style.color = '#fff';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = 'transparent';
            closeButton.style.color = '#aaa';
        };
        closeButton.onclick = () => document.body.removeChild(popupContainer);

        /**
         * Create tabs container for switching between API list and history
         */
        const tabsContainer = document.createElement('div');
        Object.assign(tabsContainer.style, {
            display: 'flex',
            borderBottom: '1px solid #444',
            marginBottom: '15px'
        });

        /**
         * Helper function to create a tab
         * @param {string} name - Tab name
         * @param {boolean} isActive - Whether the tab is active by default
         * @returns {HTMLElement} Tab element
         */
        const createTab = (name, isActive = false) => {
            const tab = document.createElement('div');
            tab.textContent = name;
            Object.assign(tab.style, {
                padding: '10px 15px',
                cursor: 'pointer',
                borderBottom: isActive ? '2px solid #4c9aff' : '2px solid transparent',
                color: isActive ? '4c9aff' : '#ccc',
                transition: 'all 0.2s'
            });
            return tab;
        };

        const apiListTab = createTab('API List', true);
        const historyTab = createTab('Test History');
        const apiListContent = document.createElement('div');
        const historyContent = document.createElement('div');
        historyContent.style.display = 'none';

        /**
         * Handle API List tab click
         */
        apiListTab.onclick = () => {
            apiListTab.style.borderBottom = '2px solid #4c9aff';
            apiListTab.style.color = '#4c9aff';
            historyTab.style.borderBottom = '2px solid transparent';
            historyTab.style.color = '#ccc';
            apiListContent.style.display = 'block';
            historyContent.style.display = 'none';
        };

        /**
         * Handle Test History tab click
         */
        historyTab.onclick = () => {
            historyTab.style.borderBottom = '2px solid #4c9aff';
            historyTab.style.color = '#4c9aff';
            apiListTab.style.borderBottom = '2px solid transparent';
            apiListTab.style.color = '#ccc';
            historyContent.style.display = 'block';
            apiListContent.style.display = 'none';
            this.updateHistoryView(historyContent);
        };

        tabsContainer.appendChild(apiListTab);
        tabsContainer.appendChild(historyTab);

        /**
         * Create form for adding new APIs
         */
        const formContainer = document.createElement('div');
        Object.assign(formContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backgroundColor: '#3a3a3a',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '15px'
        });

        const formTitle = document.createElement('h3');
        formTitle.textContent = 'Add New API';
        Object.assign(formTitle.style, {
            margin: '0',
            fontSize: '16px',
            fontWeight: 'normal',
            color: '#eee'
        });

        const apiUrlInput = this.createStyledInput('API URL', 'https://translate.fedilab.app/translate');
        const apiKeyInput = this.createStyledInput('API Key', 'your-api-key-here');

        const addButton = document.createElement('button');
        addButton.textContent = 'Add API';
        Object.assign(addButton.style, {
            padding: '10px',
            backgroundColor: '#4c9aff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'background-color 0.2s'
        });
        addButton.onmouseover = () => {
            addButton.style.backgroundColor = '#3a87e0';
        };
        addButton.onmouseout = () => {
            addButton.style.backgroundColor = '#4c9aff';
        };
        addButton.onclick = () => {
            const url = apiUrlInput.value.trim();
            const key = apiKeyInput.value.trim();
            if (url && key) {
                this.apiList.push({ url, key });
                this.saveToCache();
                apiUrlInput.value = '';
                apiKeyInput.value = '';
                this.updateApiList(apiListElement);
            }
        };

        formContainer.appendChild(formTitle);
        formContainer.appendChild(apiUrlInput);
        formContainer.appendChild(apiKeyInput);
        formContainer.appendChild(addButton);

        const apiListElement = document.createElement('div');
        Object.assign(apiListElement.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });

        /**
         * Updates the API list display
         * @param {HTMLElement} listElement - The element to update with API cards
         */
        this.updateApiList = (listElement) => {
            listElement.innerHTML = '';
            if (this.apiList.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No APIs added yet. Add one above to get started.';
                Object.assign(emptyMessage.style, {
                    textAlign: 'center',
                    color: '#aaa',
                    padding: '20px'
                });
                listElement.appendChild(emptyMessage);
                return;
            }
            this.apiList.forEach((api, index) => {
                if (!api || !api.url || !api.key) return;
                const apiCard = document.createElement('div');
                Object.assign(apiCard.style, {
                    backgroundColor: '#3a3a3a',
                    borderRadius: '6px',
                    padding: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                });
                const apiInfo = document.createElement('div');
                Object.assign(apiInfo.style, {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px'
                });
                const urlElement = document.createElement('div');
                urlElement.innerHTML = `<strong>URL:</strong> <span style="word-break: break-all;">${api.url}</span>`;
                const keyElement = document.createElement('div');
                keyElement.innerHTML = `<strong>Key:</strong> <span style="word-break: break-all;">${this.maskApiKey(api.key)}</span>`;
                apiInfo.appendChild(urlElement);
                apiInfo.appendChild(keyElement);
                const buttonsContainer = document.createElement('div');
                Object.assign(buttonsContainer.style, {
                    display: 'flex',
                    gap: '10px',
                    marginTop: '5px'
                });
                const testButton = this.createActionButton('Test', '#28a745');
                testButton.onclick = async () => {
                    const resultDiv = document.createElement('div');
                    Object.assign(resultDiv.style, {
                        marginTop: '10px',
                        padding: '10px',
                        borderRadius: '4px',
                        backgroundColor: '#444'
                    });
                    resultDiv.textContent = '⏳ Testing connection...';
                    apiCard.appendChild(resultDiv);
                    let success = false;
                    let message = '';
                    try {
                        const response = await new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage({
                                action: 'testConnection',
                                apiUrl: api.url,
                                apiKey: api.key,
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    resolve(response);
                                }
                            });
                        });
                        if (response.success) {
                            resultDiv.style.backgroundColor = '#1e462a';
                            resultDiv.textContent = `✅ Success: ${api.url}`;
                            success = true;
                            message = `Success: ${api.url}`;
                        } else {
                            resultDiv.style.backgroundColor = '#4e2828';
                            resultDiv.textContent = `❌ Error: ${response.message}`;
                            message = `Error: ${response.message}`;
                        }
                    } catch (error) {
                        resultDiv.style.backgroundColor = '#4e2828';
                        resultDiv.textContent = `❌ Error: ${error.message || 'Unknown error'}`;
                        message = `Error: ${error.message || 'Unknown error'}`;
                    }
                    this.testHistory.unshift({
                        url: api.url,
                        message,
                        success,
                        timestamp: Date.now(),
                    });
                    this.saveToCache();
                    if (historyContent.style.display !== 'none') {
                        this.updateHistoryView(historyContent);
                    }
                };
                const removeButton = this.createActionButton('Remove', '#dc3545');
                removeButton.onclick = () => {
                    this.apiList = this.apiList.filter((_, i) => i !== index);
                    this.saveToCache();
                    this.updateApiList(apiListElement);
                };
                buttonsContainer.appendChild(testButton);
                buttonsContainer.appendChild(removeButton);
                apiCard.appendChild(apiInfo);
                apiCard.appendChild(buttonsContainer);
                listElement.appendChild(apiCard);
            });
        };

        /**
         * Updates the test history display
         * @param {HTMLElement} historyContainer - The element to update with history entries
         */
        this.updateHistoryView = (historyContainer) => {
            historyContainer.innerHTML = '';
            if (this.testHistory.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No test history yet.';
                Object.assign(emptyMessage.style, {
                    textAlign: 'center',
                    color: '#aaa',
                    padding: '20px'
                });
                historyContainer.appendChild(emptyMessage);
                return;
            }
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear History';
            Object.assign(clearButton.style, {
                padding: '8px 12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                alignSelf: 'flex-end',
                marginBottom: '10px'
            });
            clearButton.onclick = () => {
                this.testHistory = [];
                this.saveToCache();
                this.updateHistoryView(historyContainer);
            };
            historyContainer.appendChild(clearButton);
            const historyList = document.createElement('div');
            Object.assign(historyList.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            });
            this.testHistory.forEach(entry => {
                const entryElement = document.createElement('div');
                Object.assign(entryElement.style, {
                    backgroundColor: entry.success ? '#1e462a' : '#4e2828',
                    borderRadius: '6px',
                    padding: '12px'
                });
                const timestamp = new Date(entry.timestamp).toLocaleString();
                const statusIcon = entry.success ? '✅' : '❌';
                entryElement.innerHTML = `
                    <div><strong>${statusIcon} ${entry.url}</strong></div>
                    <div style="margin-top: 5px; font-size: 14px;">${entry.message}</div>
                    <div style="margin-top: 8px; font-size: 12px; color: #aaa;">${timestamp}</div>
                `;
                historyList.appendChild(entryElement);
            });
            historyContainer.appendChild(historyList);
        };

        apiListContent.appendChild(formContainer);
        apiListContent.appendChild(apiListElement);
        popupContainer.appendChild(closeButton);
        popupContainer.appendChild(title);
        popupContainer.appendChild(tabsContainer);
        popupContainer.appendChild(apiListContent);
        popupContainer.appendChild(historyContent);
        this.updateApiList(apiListElement);
        document.body.appendChild(popupContainer);
        // Enable dragging for the API test popup
        this.enableDragging(popupContainer, closeButton);
    }

    /**
     * Creates a styled input field with a label
     * @param {string} label - The label for the input
     * @param {string} placeholder - The placeholder text
     * @returns {HTMLElement} Input element
     */
    createStyledInput(label, placeholder) {
        const container = document.createElement('div');
        Object.assign(container.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '5px'
        });
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        Object.assign(labelElement.style, {
            fontSize: '14px',
            color: '#ccc'
        });
        const input = document.createElement('input');
        input.placeholder = placeholder;
        Object.assign(input.style, {
            padding: '10px',
            backgroundColor: '#444',
            color: '#fff',
            border: '1px solid #555',
            outline: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            width: '100%',
            boxSizing: 'border-box'
        });
        container.appendChild(labelElement);
        container.appendChild(input);
        return input;
    }

    /**
     * Creates a styled action button
     * @param {string} text - Button text
     * @param {string} color - Background color
     * @returns {HTMLElement} Button element
     */
    createActionButton(text, color) {
        const button = document.createElement('button');
        button.textContent = text;
        Object.assign(button.style, {
            padding: '8px 12px',
            backgroundColor: color,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            flex: '1',
            transition: 'filter 0.2s'
        });
        button.onmouseover = () => {
            button.style.filter = 'brightness(85%)';
        };
        button.onmouseout = () => {
            button.style.filter = 'brightness(100%)';
        };
        return button;
    }

    /**
     * Masks the API key for display
     * @param {string} key - The API key to mask
     * @returns {string} Masked API key
     */
    maskApiKey(key) {
        if (!key || key.length < 8) return key;
        return key.substring(0, 4) + '•'.repeat(Math.min(key.length - 8, 10)) + key.substring(key.length - 4);
    }

    /**
     * Loads API list and test history from localStorage
     */
    loadFromCache() {
        try {
            const cachedApis = localStorage.getItem('apiTestList');
            if (cachedApis) {
                this.apiList = JSON.parse(cachedApis);
            }
            const cachedHistory = localStorage.getItem('apiTestHistory');
            if (cachedHistory) {
                this.testHistory = JSON.parse(cachedHistory);
            }
        } catch (error) {
            this.apiList = [];
            this.testHistory = [];
        }
    }

    /**
     * Saves API list and test history to localStorage
     */
    saveToCache() {
        try {
            localStorage.setItem('apiTestList', JSON.stringify(this.apiList));
            localStorage.setItem('apiTestHistory', JSON.stringify(this.testHistory));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }

    /**
     * Enables dragging for a popup, constraining it within viewport margins.
     * @param {HTMLElement} popup - The popup element to make draggable.
     * @param {HTMLElement} closeButton - The close button to exclude from dragging.
     */
    enableDragging(popup, closeButton) {
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX;
        let initialY;

        popup.addEventListener('mousedown', (e) => {
            // Prevent dragging if clicking on close button, input, button, or select elements
            if (e.target === closeButton || closeButton.contains(e.target) ||
                e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
                e.target.tagName === 'SELECT' || e.target.closest('button') ||
                e.target.closest('input') || e.target.closest('select')) {
                return;
            }
            initialX = e.clientX - currentX;
            initialY = e.clientY - currentY;
            isDragging = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                const popupRect = popup.getBoundingClientRect();
                const margin = 10;
                const maxX = window.innerWidth - popupRect.width - margin;
                const maxY = window.innerHeight - popupRect.height - margin;
                const minX = margin;
                const minY = margin;

                currentX = Math.max(minX, Math.min(currentX, maxX));
                currentY = Math.max(minY, Math.min(currentY, maxY));

                popup.style.left = `${currentX}px`;
                popup.style.top = `${currentY}px`;
                popup.style.transform = 'none';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
}

new TranslationManager();