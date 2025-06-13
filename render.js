/**
 * TranslationManager class handles the translation process and plugin functionality.
 */
class TranslationManager {
    constructor() {
        this.state = {
            apiUrl: '',
            apiKey: '',
            isTranslationSent: false,
            isPluginActive: false,
            currentTargetLanguage: 'en',
            shortcuts: {
                activate: 'A',
                deactivate: 'K',
                testConnection: 'T',
                toggle: 'G'
            }
        };

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

        // Debounce function to limit rapid requests
        this.debounce = (func, wait) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        };

        this.handleTextSelection = this.debounce(this.handleTextSelectionInternal, 500);

        this.init();
    }

    init() {
        this.loadState();
        this.setupListeners();
        this.setupKeyboardShortcuts();
    }

    loadState() {
        chrome.storage.local.get(['isPluginActive', 'targetLanguage', 'apiUrl', 'apiKey', 'shortcuts'], result => {
            this.state = {
                ...this.state,
                isPluginActive: !!result.isPluginActive,
                currentTargetLanguage: result.targetLanguage || 'en',
                apiUrl: result.apiUrl || '',
                apiKey: result.apiKey || '',
                shortcuts: { ...this.state.shortcuts, ...result.shortcuts }
            };
        });
    }

    setupListeners() {
        document.addEventListener('selectionchange', () => {
            this.state.isTranslationSent = false;
        });
        document.addEventListener('mouseup', () => this.handleTextSelection());
        chrome.storage.onChanged.addListener(changes => this.handleStorageChanges(changes));
        chrome.runtime.onMessage.addListener(message => this.handleMessages(message));
    }

    handleStorageChanges(changes) {
        if (changes.isPluginActive) this.state.isPluginActive = changes.isPluginActive.newValue;
        if (changes.targetLanguage) this.state.currentTargetLanguage = changes.targetLanguage.newValue;
        if (changes.apiUrl) this.state.apiUrl = changes.apiUrl.newValue;
        if (changes.apiKey) this.state.apiKey = changes.apiKey.newValue;
        if (changes.shortcuts) this.state.shortcuts = { ...this.state.shortcuts, ...changes.shortcuts.newValue };
    }

    handleMessages(message) {
        if (message.action === 'updatePluginStatus') {
            this.state.isPluginActive = message.isActive;
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
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
                        new ApiTestPopup().createApiTestListPopup();
                        break;
                    case this.state.shortcuts.toggle:
                        this.togglePluginStatus();
                        break;
                }
            }
        });
    }

    async handleTextSelectionInternal() {
        if (!this.state.isPluginActive) return;

        const selectedText = window.getSelection().toString().trim();
        if (!selectedText || this.state.isTranslationSent) return;

        try {
            const config = await this.getConfiguration();
            if (!config.apiUrl || !config.apiKey) {
                this.createErrorPopup('Please configure the API URL and API Key in the settings.');
                return;
            }

            this.sendTranslationRequest(selectedText, config);
        } catch (error) {
            this.handleError(error);
        }
    }

    async getConfiguration() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['targetLanguage', 'apiUrl', 'apiKey', 'isPluginActive', 'shortcuts'], result => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Storage error: ${chrome.runtime.lastError.message}`));
                } else {
                    resolve({
                        targetLanguage: this.state.currentTargetLanguage || result.targetLanguage || 'en',
                        apiUrl: result.apiUrl || '',
                        apiKey: result.apiKey || '',
                        isPluginActive: result.isPluginActive,
                        shortcuts: result.shortcuts
                    });
                }
            });
        });
    }

    async sendTranslationRequest(text, config) {
        this.state.isTranslationSent = true;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'translate',
                text,
                targetLanguage: config.targetLanguage,
                apiUrl: config.apiUrl,
                apiKey: config.apiKey
            });

            if (response.translatedText) {
                this.showTranslationPopup(response.translatedText, text);
            } else {
                throw new Error(response.error?.message || 'Translation failed');
            }
        } catch (error) {
            this.handleError(error);
            this.state.isTranslationSent = false;
        }
    }

    showTranslationPopup(translatedText, originalText) {
        const popup = this.createPopup(translatedText, originalText);
        this.applyPopupStyles(popup);

        const languageSelector = popup.querySelector('.language-selector');
        languageSelector.addEventListener('change', async e => {
            try {
                const newText = await this.retranslateText(popup, e.target.value);
                popup.querySelector('p').textContent = newText;
                this.resetPopupTimeout(popup);
            } catch (error) {
                popup.querySelector('p').textContent = `Translation error: ${error.message}`;
                this.createErrorPopup(error.message);
            }
        });

        const closeButton = popup.querySelector('.close-btn');
        closeButton.addEventListener('click', () => popup.remove());

        document.body.appendChild(popup);
        this.setPopupTimeout(popup);
    }

    createPopup(translatedText, originalText) {
        const popup = document.createElement('div');
        popup.className = 'translation-popup';
        popup.dataset.originalText = originalText;
        popup.innerHTML = `
            <div class="popup-content">
                <div class="popup-header">
                    <select class="language-selector">
                        ${Object.entries(this.availableLanguages)
            .map(([code, name]) => `<option value="${code}" ${code === this.state.currentTargetLanguage ? 'selected' : ''}>${name}</option>`)
            .join('')}
                    </select>
                    <button class="close-btn">×</button>
                </div>
                <p>${translatedText}</p>
            </div>
        `;
        return popup;
    }

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

    async retranslateText(popup, newLanguage) {
        const originalText = popup.dataset.originalText;
        const config = await this.getConfiguration();
        config.targetLanguage = newLanguage;

        this.state.currentTargetLanguage = newLanguage;
        chrome.storage.local.set({ targetLanguage: newLanguage });

        const response = await chrome.runtime.sendMessage({
            action: 'translate',
            text: originalText,
            targetLanguage: newLanguage,
            apiUrl: config.apiUrl,
            apiKey: config.apiKey
        });

        if (response.translatedText) {
            return response.translatedText;
        }
        throw new Error(response.error?.message || 'Translation failed');
    }

    setPopupTimeout(popup) {
        popup.timeoutId = setTimeout(() => {
            if (document.body.contains(popup)) popup.remove();
        }, 15000);
    }

    resetPopupTimeout(popup) {
        clearTimeout(popup.timeoutId);
        this.setPopupTimeout(popup);
    }

    handleError(error) {
        if (error.message.includes('Extension context invalidated')) {
            this.createErrorPopup('The extension has been updated or reloaded. Please refresh the page.');
        } else if (error.message.includes('Rate limit exceeded')) {
            this.createErrorPopup(
                'Translation rate limit exceeded. Please wait a moment, use a different API instance, or check your API key.',
                true
            );
        } else {
            this.createErrorPopup(`Error: ${error.message}`);
        }
    }

    togglePluginStatus(forceState = null) {
        this.state.isPluginActive = forceState !== null ? forceState : !this.state.isPluginActive;
        chrome.storage.local.set({ isPluginActive: this.state.isPluginActive }, () => {
            if (chrome.runtime.lastError) {
                this.createErrorPopup(`Error updating plugin status: ${chrome.runtime.lastError.message}`);
            } else {
                this.createSuccessPopup(`Plugin ${this.state.isPluginActive ? 'Activated' : 'Deactivated'}`);
            }
        });
    }

    createBanner(message, backgroundColor = '#ff0000', textColor = 'white', showRefresh = false) {
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

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.marginLeft = '10px';
        closeButton.style.background = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.color = textColor;
        closeButton.style.fontSize = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.addEventListener('click', () => banner.remove());

        banner.appendChild(closeButton);

        if (showRefresh) {
            const refreshButton = document.createElement('button');
            refreshButton.textContent = 'Refresh';
            refreshButton.style.marginLeft = '10px';
            refreshButton.style.padding = '5px 10px';
            refreshButton.style.background = 'white';
            refreshButton.style.color = backgroundColor;
            refreshButton.style.border = 'none';
            refreshButton.style.borderRadius = '3px';
            refreshButton.style.cursor = 'pointer';
            refreshButton.addEventListener('click', () => window.location.reload());
            banner.appendChild(refreshButton);
        }

        document.body.appendChild(banner);
        setTimeout(() => {
            if (banner.parentElement) banner.remove();
        }, 5000);
    }

    createSuccessPopup(message) {
        this.createBanner(message, '#28a745', 'white');
    }

    createErrorPopup(message, showRefresh = false) {
        this.createBanner(message, '#ff0000', 'white', showRefresh);
    }
}

/**
 * Class representing the API Test Popup interface.
 */
class ApiTestPopup {
    constructor() {
        this.apiList = [];
        this.testHistory = [];
        this.loadFromCache();
    }

    createApiTestListPopup() {
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

        const title = document.createElement('h2');
        title.textContent = 'API Test Manager LibreTranslate';
        title.style.margin = '0 0 10px 0';
        title.style.textAlign = 'center';
        title.style.color = '#fff';
        title.style.fontSize = '24px';
        title.style.fontWeight = 'bold';

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
        closeButton.onmouseover = () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            closeButton.style.color = '#fff';
        };
        closeButton.onmouseout = () => {
            closeButton.style.backgroundColor = 'transparent';
            closeButton.style.color = '#aaa';
        };
        closeButton.onclick = () => popupContainer.remove();

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
        addButton.onmouseover = () => addButton.style.backgroundColor = '#3a87e0';
        addButton.onmouseout = () => addButton.style.backgroundColor = '#4c9aff';

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
        apiListElement.style.display = 'flex';
        apiListElement.style.flexDirection = 'column';
        apiListElement.style.gap = '10px';

        this.updateApiList = listElement => {
            listElement.innerHTML = '';
            if (this.apiList.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No APIs added yet.';
                emptyMessage.style.textAlign = 'center';
                emptyMessage.style.color = '#aaa';
                emptyMessage.style.padding = '20px';
                listElement.appendChild(emptyMessage);
                return;
            }

            this.apiList.forEach((api, index) => {
                if (!api?.url || !api?.key) return;

                const apiCard = document.createElement('div');
                apiCard.style.backgroundColor = '#3a3a3a';
                apiCard.style.borderRadius = '6px';
                apiCard.style.padding = '15px';
                apiCard.style.display = 'flex';
                apiCard.style.flexDirection = 'column';
                apiCard.style.gap = '10px';

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
                    resultDiv.textContent = '⏳ Testing connection...';
                    apiCard.appendChild(resultDiv);

                    try {
                        const response = await chrome.runtime.sendMessage({
                            action: 'testConnection',
                            apiUrl: api.url,
                            apiKey: api.key
                        });

                        this.testHistory.push({
                            url: api.url,
                            success: response.success,
                            message: response.message,
                            timestamp: Date.now()
                        });
                        this.saveToCache();

                        resultDiv.style.backgroundColor = response.success ? '#1e462a' : '#4e2828';
                        resultDiv.textContent = response.success ? `✅ Success: ${api.url}` : `❌ Error: ${response.message}`;
                    } catch (error) {
                        this.testHistory.push({
                            url: api.url,
                            success: false,
                            message: error.message || 'Unknown error',
                            timestamp: Date.now()
                        });
                        this.saveToCache();

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

        this.updateHistoryView = historyContainer => {
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

        apiListContent.appendChild(formContainer);
        apiListContent.appendChild(apiListElement);

        popupContainer.appendChild(closeButton);
        popupContainer.appendChild(title);
        popupContainer.appendChild(tabsContainer);
        popupContainer.appendChild(apiListContent);
        popupContainer.appendChild(historyContent);

        this.updateApiList(apiListElement);
        document.body.appendChild(popupContainer);
    }

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
        input.style.borderRadius = '4px';
        input.style.fontSize = '14px';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';

        container.appendChild(labelElement);
        container.appendChild(input);
        return input;
    }

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
        button.onmouseover = () => button.style.filter = 'brightness(85%)';
        button.onmouseout = () => button.style.filter = 'brightness(100%)';
        return button;
    }

    maskApiKey(key) {
        if (!key || key.length < 8) return key;
        return key.substring(0, 4) + '•'.repeat(Math.min(key.length - 8, 10)) + key.substring(key.length - 4);
    }

    loadFromCache() {
        try {
            const cachedApis = localStorage.getItem('apiTestList');
            if (cachedApis) this.apiList = JSON.parse(cachedApis);
            const cachedHistory = localStorage.getItem('apiTestHistory');
            if (cachedHistory) this.testHistory = JSON.parse(cachedHistory);
        } catch (error) {
            console.error('Error loading from cache:', error);
            this.apiList = [];
            this.testHistory = [];
        }
    }

    saveToCache() {
        try {
            localStorage.setItem('apiTestList', JSON.stringify(this.apiList));
            localStorage.setItem('apiTestHistory', JSON.stringify(this.testHistory));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }
}

new TranslationManager();