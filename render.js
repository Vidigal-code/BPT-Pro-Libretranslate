/**
 * TranslationManager class handles the translation process, including activating/deactivating the plugin,
 * sending translation requests, handling text selections, showing translation popups, and managing settings.
 */
class TranslationManager {

    constructor() {
        /**
         * Initializes the state object with default values for the plugin status, target language, and shortcuts.
         */
        this.state = {
            apiUrl: '', // ApiUrl (set to a default if needed)
            apiKey: '', // ApiKey (set to a default if needed)
            isTranslationSent: false,  // Tracks if a translation has been sent
            isPluginActive: false, // Tracks if the plugin is active
            currentTargetLanguage: 'en', // Default target language is English
            shortcuts: {
                activate: 'A', // Shortcut key to activate the plugin
                deactivate: 'K', // Shortcut key to deactivate the plugin
                testConnection: 'T', // Shortcut key to test the connection
                toggle: 'G', // Shortcut key to toggle plugin activation
            }
        };
        /**
         * A list of available languages with their respective language codes.
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
        /**
         * Initializes the TranslationManager instance by loading state, setting up event listeners, and keyboard shortcuts.
         */
        this.init();
    }


    /**
     * Loads the current plugin state from local storage and sets up event listeners and keyboard shortcuts.
     */
    init() {
        this.loadState();
        this.setupListeners();
        this.setupKeyboardShortcuts();
    }

    /**
     * Loads the plugin state (e.g., whether it's active and the target language) from local storage.
     */
    loadState() {
        chrome.storage.local.get(['isPluginActive', 'targetLanguage', 'shortcuts'], (result) => {
            this.state.isPluginActive = result.isPluginActive || false;
            this.state.currentTargetLanguage = result.targetLanguage || 'en';
            if (result.shortcuts) {
                this.state.shortcuts = {...this.state.shortcuts, ...result.shortcuts};
            }
            document.getElementById('shortcutToggle').value = this.state.shortcuts.toggle;
        });
    }

    /**
     * Sets up event listeners for selection changes, mouse-up events, and storage updates.
     */
    setupListeners() {
        document.addEventListener('selectionchange', () => {
            this.state.isTranslationSent = false; // Reset translation flag when selection changes
        });
        document.addEventListener('mouseup', () => this.handleTextSelection());
        chrome.storage.onChanged.addListener((changes) => this.handleStorageChanges(changes));
        chrome.runtime.onMessage.addListener((message) => this.handleMessages(message));
    }


    /**
     * Handles changes in the local storage (e.g., updates to plugin status, target language, or shortcuts).
     */
    handleStorageChanges(changes) {
        if (changes.isPluginActive) {
            this.state.isPluginActive = changes.isPluginActive.newValue;
        }
        if (changes.targetLanguage) {
            this.state.currentTargetLanguage = changes.targetLanguage.newValue;
        }
        if (changes.shortcuts) {
            this.state.shortcuts = {...this.state.shortcuts, ...changes.shortcuts.newValue};
        }
    }

    /**
     * Handles messages received from other parts of the extension, such as plugin status updates.
     */
    handleMessages(message) {
        if (message.action === 'updatePluginStatus') {
            this.state.isPluginActive = message.isActive;
        }
    }

    /**
     * Sets up keyboard shortcuts to activate/deactivate the plugin, test connection, and toggle the plugin status.
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
                    default:
                        break;
                }
            }
        });
    }

    /**
     * Handles text selection and sends a translation request if text is selected and the plugin is active.
     */
    async handleTextSelection() {
        if (!this.state.isPluginActive) return;  // Ensure the plugin is active


        const selectedText = window.getSelection().toString().trim();  // Get the selected text
        if (!selectedText || this.state.isTranslationSent) return;  // No text selected or translation already sent


        try {
            const config = await this.getConfiguration();
            if (!config.apiUrl || !config.apiKey) {
                alert("Please configure the API URL and API Key in the settings.");
                return;
            }

            // Send translation request
            this.sendTranslationRequest(selectedText, config);
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Retrieves the configuration settings (target language, API URL, and API key) from local storage.
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
                console.error("Unexpected error:", error);
                reject(new Error("Extension context invalidated or unexpected error occurred."));
            }
        });
    }


    /**
     * Sends the translation request to the extension background script and handles the response.
     */
    async sendTranslationRequest(text, config) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'translate',
                text: text,
                targetLanguage: config.targetLanguage,
                apiUrl: config.apiUrl,
                apiKey: config.apiKey,
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
     * Displays a popup with the translated text and allows the user to select a new language for retranslation.
     */
    showTranslationPopup(translatedText, originalText) {
        const popup = this.createPopup(translatedText, originalText); // Create the translation popup
        this.applyPopupStyles(popup);  // Apply styles to the popup

        // Event listener for language selector change
        const languageSelector = popup.querySelector('.language-selector');

        languageSelector.addEventListener('change', (e) => {
            (async () => {
                try {
                    const newText = await this.retranslateText(popup, e.target.value);
                    popup.querySelector('p').textContent = newText;
                    this.resetPopupTimeout(popup);
                } catch (error) {
                    popup.querySelector('p').textContent = 'Translation error: ' + error.message;
                }
            })();
        });


        // Event listener for closing the popup
        const closeButton = popup.querySelector('.close-btn');
        closeButton.addEventListener('click', () => popup.remove());

        document.body.appendChild(popup);
        this.setPopupTimeout(popup);  // Set a timeout to auto-close the popup


    }

    /**
     * Creates the HTML structure for the translation popup, including the translated text and language selector.
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
                    <button class="close-btn">&times;</button>
                </div>
                <p>${translatedText}</p>
            </div>
        `;
        return popup;
    }


    /**
     * Applies CSS styles to the translation popup.
     */
    applyPopupStyles(popup) {

        popup.style.position = 'fixed';
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        popup.style.color = '#fff';
        popup.style.padding = '20px';
        popup.style.borderRadius = '8px';
        popup.style.zIndex = '10000';
        popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        popup.style.minWidth = '250px';
        popup.style.maxWidth = '80%';

        const popupContent = popup.querySelector('.popup-content');
        popupContent.style.position = 'relative';

        const popupHeader = popup.querySelector('.popup-header');
        popupHeader.style.display = 'flex';
        popupHeader.style.justifyContent = 'space-between';
        popupHeader.style.alignItems = 'center';
        popupHeader.style.marginBottom = '10px';

        const languageSelector = popup.querySelector('.language-selector');
        languageSelector.style.padding = '5px';
        languageSelector.style.borderRadius = '5px';
        languageSelector.style.border = '1px solid #ccc';
        languageSelector.style.background = '#f5f5f5';
        languageSelector.style.color = '#333';

        const closeButton = popup.querySelector('.close-btn');
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.color = '#fff';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.lineHeight = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.style.fontWeight = 'bold';
        closeButton.style.borderRadius = '50%';
        closeButton.style.width = '24px';
        closeButton.style.height = '24px';
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';

        closeButton.addEventListener('mouseover', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });

        closeButton.addEventListener('mouseout', () => {
            closeButton.style.backgroundColor = 'transparent';
        });

        const paragraph = popup.querySelector('p');
        paragraph.style.margin = '0';
        paragraph.style.fontSize = '16px';
        paragraph.style.lineHeight = '1.5';
        paragraph.style.wordBreak = 'break-word';

    }


    /**
     * Retranslates the original text with a new target language.
     */
    async retranslateText(popup, newLanguage) {
        const originalText = popup.dataset.originalText;
        const config = await this.getConfiguration();
        config.targetLanguage = newLanguage;

        this.state.currentTargetLanguage = newLanguage;
        chrome.storage.local.set({targetLanguage: newLanguage}, () => {
            if (chrome.runtime.lastError) {
                throw new Error("Error saving language preference: " + chrome.runtime.lastError.message);
            }
        });

        const response = await chrome.runtime.sendMessage({
            action: 'translate',
            text: originalText,
            targetLanguage: newLanguage,
            apiUrl: config.apiUrl,
            apiKey: config.apiKey,
        });

        if (response && response.translatedText) {
            return response.translatedText;
        } else {
            throw new Error(response?.error?.message || 'Unknown translation error');
        }
    }

    /**
     * Sets a timeout to automatically close the translation popup after a certain time.
     */
    setPopupTimeout(popup) {
        popup.timeoutId = setTimeout(() => {
            if (document.body.contains(popup)) {
                popup.remove();
            }
        }, 15000);
    }


    /**
     * Resets the timeout for the translation popup when the content changes (e.g., retranslation).
     */
    resetPopupTimeout(popup) {
        clearTimeout(popup.timeoutId);
        this.setPopupTimeout(popup);
    }


    /**
     * Handles errors by displaying an appropriate message, such as connection issues or unexpected errors.
     */
    handleError(error) {
        if (error.message.includes('Extension context invalidated')) {
            this.createErrorPopup("The extension has been updated or reloaded. Please refresh the page to continue using it.");
        } else {
            alert("Error: " + error.message);
        }
    }

    /**
     * Toggles the plugin status between active and inactive.
     */
    togglePluginStatus(forceState = null) {
        this.state.isPluginActive = forceState !== null ? forceState : !this.state.isPluginActive;
        chrome.storage.local.set({isPluginActive: this.state.isPluginActive}, () => {
            if (chrome.runtime.lastError) {
                alert("Error updating plugin status: " + chrome.runtime.lastError.message);
            } else {
                this.createSuccessPopup(`Plugin ${this.state.isPluginActive ? 'Activated' : 'Deactivated'}`);
            }
        });
    }

    /**
     * Creates and displays a banner for messages (e.g., success or error).
     * @param {string} message - The message to display in the banner.
     * @param {string} backgroundColor - The background color of the banner.
     * @param {string} textColor - The text color of the banner.
     */
    createBanner(message, backgroundColor = '#ff0000', textColor = 'white') {
        const banner = document.createElement('div');
        banner.className = 'dynamic-banner';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.backgroundColor = backgroundColor;
        banner.style.color = textColor;
        banner.style.padding = '10px';
        banner.style.textAlign = 'center';
        banner.style.zIndex = '10001';
        banner.style.fontFamily = 'Arial, sans-serif';
        banner.textContent = message;

        // Close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.marginLeft = '10px';
        closeButton.style.background = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.color = textColor;
        closeButton.style.fontSize = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.addEventListener('click', () => banner.remove());

        // Refresh button
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh';
        refreshButton.style.marginLeft = '10px';
        refreshButton.style.padding = '5px 10px';
        refreshButton.style.background = 'white';
        refreshButton.style.color = backgroundColor; // Match button text color to banner background
        refreshButton.style.border = 'none';
        refreshButton.style.borderRadius = '3px';
        refreshButton.style.cursor = 'pointer';
        refreshButton.addEventListener('click', () => window.location.reload());

        // Append buttons to banner
        banner.appendChild(refreshButton);
        banner.appendChild(closeButton);

        // Add banner to the document body
        document.body.appendChild(banner);

        // Automatically remove the banner after 5 seconds
        setTimeout(() => {
            if (banner.parentElement) {
                banner.remove();
            }
        }, 5000);
    }

    /**
     * Creates and displays a success banner.
     * @param {string} message - The success message to display.
     */
    createSuccessPopup(message) {
        this.createBanner(message, '#28a745', 'white'); // Green background with white text
    }

    /**
     * Creates and displays an error banner.
     * @param {string} message - The error message to display.
     */
    createErrorPopup(message) {
        this.createBanner(message, '#ff0000', 'white'); // Red background with white text
    }

}


/**
 * Class representing the API Test Popup interface.
 */
class ApiTestPopup {

    /**
     * Initializes the API Test Popup instance.
     * - `apiList`: Stores the list of APIs added by the user.
     * - `testHistory`: Stores the history of API tests.
     */
    constructor() {
        this.apiList = [];
        this.testHistory = [];
        this.loadFromCache();
    }

    /**
     * Creates and displays the API Test Popup interface.
     */
    createApiTestListPopup() {

        // Create main container with improved styling
        const popupContainer = document.createElement('div');
        popupContainer.style.position = 'fixed';
        popupContainer.style.top = '50%';
        popupContainer.style.left = '50%';
        popupContainer.style.transform = 'translate(-50%, -50%)';
        popupContainer.style.backgroundColor = '#2d2d2d';
        popupContainer.style.color = '#fff';
        popupContainer.style.padding = '25px';
        popupContainer.style.borderRadius = '12px';
        popupContainer.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.5)';
        popupContainer.style.width = '500px';
        popupContainer.style.maxHeight = '80vh';
        popupContainer.style.overflowY = 'auto';
        popupContainer.style.zIndex = '10000';
        popupContainer.style.fontFamily = 'Arial, sans-serif';
        popupContainer.style.display = 'flex';
        popupContainer.style.flexDirection = 'column';
        popupContainer.style.gap = '15px';

        // Title with improved styling
        const title = document.createElement('h2');
        title.textContent = 'API Test Manager LibreTranslate';
        title.style.margin = '0 0 10px 0';
        title.style.textAlign = 'center';
        title.style.color = '#fff';
        title.style.fontSize = '24px';
        title.style.fontWeight = 'bold';

        // Close button with improved styling
        const closeButton = document.createElement('button');
        closeButton.textContent = '✕';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '15px';
        closeButton.style.right = '15px';
        closeButton.style.background = 'transparent';
        closeButton.style.color = '#aaa';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '18px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '5px 10px';
        closeButton.style.borderRadius = '4px';
        closeButton.style.transition = 'all 0.2s';
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            closeButton.style.color = '#fff';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = 'transparent';
            closeButton.style.color = '#aaa';
        };
        closeButton.onclick = () => document.body.removeChild(popupContainer);

        // Create tabbed interface
        const tabsContainer = document.createElement('div');
        tabsContainer.style.display = 'flex';
        tabsContainer.style.borderBottom = '1px solid #444';
        tabsContainer.style.marginBottom = '15px';

        const createTab = (name, isActive = false) => {
            const tab = document.createElement('div');
            tab.textContent = name;
            tab.style.padding = '10px 15px';
            tab.style.cursor = 'pointer';
            tab.style.borderBottom = isActive ? '2px solid #4c9aff' : '2px solid transparent';
            tab.style.color = isActive ? '#4c9aff' : '#ccc';
            tab.style.transition = 'all 0.2s';
            return tab;
        };

        const apiListTab = createTab('API List', true);
        const historyTab = createTab('Test History');

        const apiListContent = document.createElement('div');
        const historyContent = document.createElement('div');
        historyContent.style.display = 'none';

        apiListTab.onclick = () => {
            apiListTab.style.borderBottom = '2px solid #4c9aff';
            apiListTab.style.color = '#4c9aff';
            historyTab.style.borderBottom = '2px solid transparent';
            historyTab.style.color = '#ccc';
            apiListContent.style.display = 'block';
            historyContent.style.display = 'none';
        };

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

        // Create form for adding new APIs with improved styling
        const formContainer = document.createElement('div');
        formContainer.style.display = 'flex';
        formContainer.style.flexDirection = 'column';
        formContainer.style.gap = '10px';
        formContainer.style.backgroundColor = '#3a3a3a';
        formContainer.style.padding = '15px';
        formContainer.style.borderRadius = '8px';
        formContainer.style.marginBottom = '15px';

        const formTitle = document.createElement('h3');
        formTitle.textContent = 'Add New API';
        formTitle.style.margin = '0';
        formTitle.style.fontSize = '16px';
        formTitle.style.fontWeight = 'normal';
        formTitle.style.color = '#eee';

        const apiUrlInput = this.createStyledInput('API URL', 'https://translate.fedilab.app/translate');
        const apiKeyInput = this.createStyledInput('API Key', 'your-api-key-here');

        const addButton = document.createElement('button');
        addButton.textContent = 'Add API';
        addButton.style.padding = '10px';
        addButton.style.backgroundColor = '#4c9aff';
        addButton.style.color = 'white';
        addButton.style.border = 'none';
        addButton.style.borderRadius = '4px';
        addButton.style.cursor = 'pointer';
        addButton.style.fontSize = '14px';
        addButton.style.fontWeight = 'bold';
        addButton.style.transition = 'background-color 0.2s';
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
                this.apiList.push({url, key});
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

        // API List with improved styling
        const apiListElement = document.createElement('div');
        apiListElement.style.display = 'flex';
        apiListElement.style.flexDirection = 'column';
        apiListElement.style.gap = '10px';


        /**
         * Updates the API list display.
         * @param {HTMLElement} listElement - The container element where the API list will be displayed.
         */
        this.updateApiList = (listElement) => {
            listElement.innerHTML = '';

            if (this.apiList.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No APIs added yet. Add one above to get started.';
                emptyMessage.style.textAlign = 'center';
                emptyMessage.style.color = '#aaa';
                emptyMessage.style.padding = '20px';
                listElement.appendChild(emptyMessage);
                return;
            }

            this.apiList.forEach((api, index) => {
                if (!api || !api.url || !api.key) return;

                const apiCard = document.createElement('div');
                apiCard.style.backgroundColor = '#3a3a3a';
                apiCard.style.borderRadius = '6px';
                apiCard.style.padding = '15px';
                apiCard.style.display = 'flex';
                apiCard.style.flexDirection = 'column';
                apiCard.style.gap = '10px';

                // API Info
                const apiInfo = document.createElement('div');
                apiInfo.style.display = 'flex';
                apiInfo.style.flexDirection = 'column';
                apiInfo.style.gap = '5px';

                const urlElement = document.createElement('div');
                urlElement.innerHTML = `<strong>URL:</strong> <span style="word-break: break-all;">${api.url}</span>`;

                const keyElement = document.createElement('div');
                keyElement.innerHTML = `<strong>Key:</strong> <span style="word-break: break-all;">${this.maskApiKey(api.key)}</span>`;

                apiInfo.appendChild(urlElement);
                apiInfo.appendChild(keyElement);

                // Action buttons
                const buttonsContainer = document.createElement('div');
                buttonsContainer.style.display = 'flex';
                buttonsContainer.style.gap = '10px';
                buttonsContainer.style.marginTop = '5px';

                const testButton = this.createActionButton('Test', '#28a745');
                testButton.onclick = async () => {
                    const resultDiv = document.createElement('div');
                    resultDiv.style.marginTop = '10px';
                    resultDiv.style.padding = '10px';
                    resultDiv.style.borderRadius = '4px';
                    resultDiv.style.backgroundColor = '#444';

                    // Show loading message
                    resultDiv.textContent = '⏳ Testing connection...';
                    apiCard.appendChild(resultDiv);

                    try {
                        const response = await chrome.runtime.sendMessage({
                            action: 'testConnection',
                            apiUrl: api.url,
                            apiKey: api.key,
                        });

                        if (response.success) {
                            resultDiv.style.backgroundColor = '#1e462a';
                            resultDiv.textContent = `✅ Success: ${api.url}`;
                        } else {
                            resultDiv.style.backgroundColor = '#4e2828';
                            resultDiv.textContent = `❌ Error: ${response.message}`;
                        }
                    } catch (error) {
                        resultDiv.style.backgroundColor = '#4e2828';
                        resultDiv.textContent = `❌ Error: ${error.message || 'Unknown error'}`;
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
         * Updates the test history view.
         * @param {HTMLElement} historyContainer - The container element for the test history.
         */
        this.updateHistoryView = (historyContainer) => {
            historyContainer.innerHTML = '';

            if (this.testHistory.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No test history yet.';
                emptyMessage.style.textAlign = 'center';
                emptyMessage.style.color = '#aaa';
                emptyMessage.style.padding = '20px';
                historyContainer.appendChild(emptyMessage);
                return;
            }

            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear History';
            clearButton.style.padding = '8px 12px';
            clearButton.style.backgroundColor = '#6c757d';
            clearButton.style.color = 'white';
            clearButton.style.border = 'none';
            clearButton.style.borderRadius = '4px';
            clearButton.style.cursor = 'pointer';
            clearButton.style.alignSelf = 'flex-end';
            clearButton.style.marginBottom = '10px';
            clearButton.onclick = () => {
                this.testHistory = [];
                this.saveToCache();
                this.updateHistoryView(historyContainer);
            };
            historyContainer.appendChild(clearButton);

            const historyList = document.createElement('div');
            historyList.style.display = 'flex';
            historyList.style.flexDirection = 'column';
            historyList.style.gap = '10px';

            this.testHistory.forEach(entry => {
                const entryElement = document.createElement('div');
                entryElement.style.backgroundColor = entry.success ? '#1e462a' : '#4e2828';
                entryElement.style.borderRadius = '6px';
                entryElement.style.padding = '12px';

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

        // Assemble content sections
        apiListContent.appendChild(formContainer);
        apiListContent.appendChild(apiListElement);

        // Assemble popup
        popupContainer.appendChild(closeButton);
        popupContainer.appendChild(title);
        popupContainer.appendChild(tabsContainer);
        popupContainer.appendChild(apiListContent);
        popupContainer.appendChild(historyContent);

        // Update API list
        this.updateApiList(apiListElement);

        // Add popup to body
        document.body.appendChild(popupContainer);
    }


    /**
     * Creates a styled input field with a label.
     * @param {string} label - The text for the input field label.
     * @param {string} placeholder - The placeholder text for the input field.
     * @returns {HTMLInputElement} The input element created.
     */
    createStyledInput(label, placeholder) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '5px';

        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.style.fontSize = '14px';
        labelElement.style.color = '#ccc';

        const input = document.createElement('input');
        input.placeholder = placeholder;
        input.style.padding = '10px';
        input.style.backgroundColor = '#444';
        input.style.color = '#fff';
        input.style.border = '1px solid #555';
        input.style.outline = 'none';
        input.style.border = '1px solid #555';
        input.style.outline = 'none';
        input.style.borderRadius = '4px';
        input.style.fontSize = '14px';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';

        container.appendChild(labelElement);
        container.appendChild(input);

        return input;
    }


    /**
     * Creates a styled action button.
     * @param {string} text - The text for the button.
     * @param {string} color - The background color of the button.
     * @returns {HTMLButtonElement} The button element created.
     */
    createActionButton(text, color) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.padding = '8px 12px';
        button.style.backgroundColor = color;
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.fontSize = '14px';
        button.style.fontWeight = 'bold';
        button.style.flex = '1';
        button.style.transition = 'filter 0.2s';
        button.onmouseover = () => {
            button.style.filter = 'brightness(85%)';
        };
        button.onmouseout = () => {
            button.style.filter = 'brightness(100%)';
        };

        return button;
    }


    /**
     * Masks an API key for security purposes by obfuscating parts of the key.
     * @param {string} key - The API key to be masked.
     * @returns {string} The masked API key.
     */
    maskApiKey(key) {
        if (!key || key.length < 8) return key;
        return key.substring(0, 4) + '•'.repeat(Math.min(key.length - 8, 10)) + key.substring(key.length - 4);
    }


    /**
     * Loads the cached API list and test history from localStorage.
     * @returns {void}
     */
    loadFromCache() {
        try {
            // Load API list
            const cachedApis = localStorage.getItem('apiTestList');
            if (cachedApis) {
                this.apiList = JSON.parse(cachedApis);
            }

            // Load test history
            const cachedHistory = localStorage.getItem('apiTestHistory');
            if (cachedHistory) {
                this.testHistory = JSON.parse(cachedHistory);
            }
        } catch (error) {
            console.error('Error loading from cache:', error);
            this.apiList = [];
            this.testHistory = [];
        }
    }

    /**
     * Saves the API list and test history to localStorage.
     * @returns {void}
     */
    saveToCache() {
        try {
            localStorage.setItem('apiTestList', JSON.stringify(this.apiList));
            localStorage.setItem('apiTestHistory', JSON.stringify(this.testHistory));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }

}


