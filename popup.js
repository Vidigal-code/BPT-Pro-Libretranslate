/**
 * PopupManager is responsible for handling the settings interface of the translation plugin.
 */
class PopupManager {
    constructor() {
        this.defaultApiUrl = 'https://translate.fedilab.app/translate';

        this.state = {
            apiUrl: this.defaultApiUrl,
            apiKey: '',
            isPluginActive: false,
            shortcuts: {
                activate: 'A',
                deactivate: 'K',
                testConnection: 'T',
                toggle: 'G',
            }
        };

        this.init();
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.setupStorageListener();
        this.setupMessageListener();
        this.setupKeyboardShortcuts();
    }

    loadSettings() {
        chrome.storage.local.get(['targetLanguage', 'apiUrl', 'apiKey', 'isPluginActive', 'shortcuts'], (result) => {
            this.state = {
                ...this.state,
                apiUrl: result.apiUrl || this.defaultApiUrl,
                apiKey: result.apiKey || '',
                isPluginActive: !!result.isPluginActive,
                shortcuts: { ...this.state.shortcuts, ...result.shortcuts }
            };

            document.getElementById('languageSelect').value = result.targetLanguage || 'en';
            document.getElementById('apiUrl').value = this.state.apiUrl;
            document.getElementById('apiKey').value = this.state.apiKey;
            document.getElementById('shortcutActivate').value = this.state.shortcuts.activate;
            document.getElementById('shortcutDeactivate').value = this.state.shortcuts.deactivate;
            document.getElementById('shortcutTestConnection').value = this.state.shortcuts.testConnection;
            document.getElementById('shortcutToggle').value = this.state.shortcuts.toggle;

            this.updatePluginButton();
        });
    }

    setupEventListeners() {
        document.getElementById('saveButton').addEventListener('click', () => this.saveSettings());
        document.getElementById('togglePluginButton').addEventListener('click', () => this.togglePluginStatus());
        document.getElementById('testConnectionButton').addEventListener('click', () => this.testConnection());
        document.querySelectorAll('.shortcut-settings input').forEach(input => {
            input.addEventListener('input', () => this.updateShortcuts());
        });
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener(changes => {
            if (changes.isPluginActive) {
                this.state.isPluginActive = changes.isPluginActive.newValue;
                this.updatePluginButton();
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener(message => {
            if (message.action === 'updatePluginStatus') {
                this.state.isPluginActive = message.isActive;
                this.updatePluginButton();
            }
        });
    }

    updateShortcuts() {
        this.state.shortcuts = {
            activate: document.getElementById('shortcutActivate').value.toUpperCase() || 'A',
            deactivate: document.getElementById('shortcutDeactivate').value.toUpperCase() || 'K',
            testConnection: document.getElementById('shortcutTestConnection').value.toUpperCase() || 'T',
            toggle: document.getElementById('shortcutToggle').value.toUpperCase() || 'G'
        };
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
                        this.testConnection();
                        break;
                    case this.state.shortcuts.toggle:
                        this.togglePluginStatus();
                        break;
                }
            }
        });
    }

    saveSettings() {
        const settings = {
            targetLanguage: document.getElementById('languageSelect').value,
            apiUrl: document.getElementById('apiUrl').value,
            apiKey: document.getElementById('apiKey').value,
            isPluginActive: this.state.isPluginActive,
            shortcuts: this.state.shortcuts
        };

        if (!settings.apiUrl || !settings.apiKey) {
            alert('Please fill in both API URL and API Key fields.');
            return;
        }

        chrome.storage.local.set(settings, () => {
            this.state = { ...this.state, ...settings };
            alert('Settings saved successfully');
        });
    }

    togglePluginStatus(forceState = null) {
        this.state.isPluginActive = forceState !== null ? forceState : !this.state.isPluginActive;
        chrome.storage.local.set({ isPluginActive: this.state.isPluginActive }, () => {
            this.updatePluginButton();
            chrome.runtime.sendMessage({ action: 'updatePluginStatus', isActive: this.state.isPluginActive });
        });
    }

    updatePluginButton() {
        const statusButton = document.getElementById('togglePluginButton');
        statusButton.innerHTML = `Plugin Status: <strong>${this.state.isPluginActive ? 'Active' : 'Inactive'}</strong>`;
    }

    async testConnection() {
        const { apiUrl, apiKey } = this.state;

        if (!apiUrl || !apiKey) {
            alert('Please enter both API URL and API Key to test connection.');
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'testConnection',
                apiUrl,
                apiKey
            });
            alert(response.success ? 'Connection successful!' : `Connection failed: ${response.message}`);
        } catch (error) {
            alert(`Error testing connection: ${error.message || 'Unknown error'}`);
        }
    }
}

new PopupManager();