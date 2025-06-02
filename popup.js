/**
 * PopupManager is responsible for handling the settings interface of the translation plugin.
 * It loads, saves, and manages plugin settings including language selection, API URL, API key, and keyboard shortcuts.
 */

class PopupManager {
    constructor() {
        /**
         * Initialize the state of the plugin, including plugin status and keyboard shortcuts.
         * The default API URL is defined for the translation service.
         */

        this.defaultApiUrl = 'https://translate.fedilab.app/translate'; // Default API URL

        this.state = {
            apiUrl: this.defaultApiUrl, // ApiUrl (set to a default if needed)
            apiKey: '', // ApiKey (set to a default if needed)
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

    /**
     * Initializes the PopupManager by loading settings, setting up event listeners,
     * and setting up listeners for storage changes and messages.
     */
    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.setupStorageListener();
        this.setupMessageListener();
        this.setupKeyboardShortcuts();
    }

    /**
     * Loads the settings from Chrome's local storage and updates the popup UI accordingly.
     * Sets default values if no saved settings exist.
     */
    loadSettings() {
        chrome.storage.local.get(['targetLanguage', 'apiUrl', 'apiKey', 'isPluginActive', 'shortcuts'], (result) => {
            if (result.shortcuts) {
                this.state.shortcuts = {...this.state.shortcuts, ...result.shortcuts};
            }
            document.getElementById('languageSelect').value = result.targetLanguage || 'en'; // Set the language select dropdown
            document.getElementById('apiUrl').value = result.apiUrl || this.defaultApiUrl; // Set the API URL input field
            document.getElementById('apiKey').value = result.apiKey || ''; // Set the API key input field
            document.getElementById('shortcutActivate').value = this.state.shortcuts.activate;
            document.getElementById('shortcutDeactivate').value = this.state.shortcuts.deactivate;
            document.getElementById('shortcutTestConnection').value = this.state.shortcuts.testConnection;
            document.getElementById('shortcutToggle').value = this.state.shortcuts.toggle;
            this.state.isPluginActive = result.isPluginActive || false; // Set plugin active status
            this.state.apiUrl = result.apiUrl || '';
            this.state.apiKey = result.apiKey || '';


            this.updatePluginButton(); // Update the plugin status button
        });
    }

    /**
     * Sets up event listeners for user interactions with the settings interface.
     * Listens for save, toggle, test connection, and shortcut changes.
     */
    setupEventListeners() {
        document.getElementById('saveButton').addEventListener('click', () => this.saveSettings());
        document.getElementById('togglePluginButton').addEventListener('click', () => this.togglePluginStatus());
        document.getElementById('testConnectionButton').addEventListener('click', () => this.testConnection());
        document.querySelectorAll('.shortcut-settings input').forEach((input) => {
            input.addEventListener('input', () => this.updateShortcuts());
        });
    }

    /**
     * Sets up a listener for changes to Chrome's local storage and updates the plugin status accordingly.
     */
    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.isPluginActive) {
                this.state.isPluginActive = changes.isPluginActive.newValue;
                this.updatePluginButton();
            }
        });
    }

    /**
     * Sets up a listener for messages from other parts of the extension, specifically to update the plugin status.
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message) => {
            if (message.action === 'updatePluginStatus') {
                this.state.isPluginActive = message.isActive;
                this.updatePluginButton();
            }
        });
    }

    /**
     * Updates the shortcut keys based on the user input in the settings panel.
     */
    updateShortcuts() {
        this.state.shortcuts.activate = document.getElementById('shortcutActivate').value.toUpperCase() || 'A';
        this.state.shortcuts.deactivate = document.getElementById('shortcutDeactivate').value.toUpperCase() || 'K';
        this.state.shortcuts.testConnection = document.getElementById('shortcutTestConnection').value.toUpperCase() || 'T';
        this.state.shortcuts.toggle = document.getElementById('shortcutToggle').value.toUpperCase() || 'G';
    }

    /**
     * Sets up global keyboard shortcuts to control the plugin.
     * Users can toggle the plugin, test the connection, or change the plugin status using the assigned keyboard shortcuts.
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
                        this.testConnection();
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
     * Saves the settings to Chrome's local storage, including target language, API URL, API key, and keyboard shortcuts.
     */
    saveSettings() {
        const selectedLanguage = document.getElementById('languageSelect').value;
        const apiUrl = document.getElementById('apiUrl').value;
        const apiKey = document.getElementById('apiKey').value;

        if (!apiUrl || !apiKey) {
            alert('Please fill in both API URL and API Key fields.');
            return;
        }

        chrome.storage.local.set(
            {
                targetLanguage: selectedLanguage,
                apiUrl: apiUrl,
                apiKey: apiKey,
                isPluginActive: this.state.isPluginActive,
                shortcuts: this.state.shortcuts,
            },
            () => {
                alert('Settings saved successfully');
            }
        );
    }

    /**
     * Toggles the plugin's active status and updates the UI accordingly.
     * Optionally, force the plugin to a specific state if provided.
     */
    togglePluginStatus(forceState = null) {
        this.state.isPluginActive = forceState !== null ? forceState : !this.state.isPluginActive;
        chrome.storage.local.set({isPluginActive: this.state.isPluginActive}, () => {
            this.updatePluginButton(); // Update the plugin button to reflect the new state
            chrome.runtime.sendMessage({action: 'updatePluginStatus', isActive: this.state.isPluginActive});
        });
    }

    /**
     * Updates the plugin status button to show whether the plugin is active or inactive.
     */
    updatePluginButton() {
        const statusButton = document.getElementById('togglePluginButton');
        statusButton.innerHTML = `Plugin Status: <strong>${this.state.isPluginActive ? 'Active' : 'Inactive'}</strong>`;
    }

    /**
     * Tests the connection to the DeepL API using the configured API URL and API Key.
     * Alerts the user whether the connection was successful or not.
     */
    async testConnection() {
        const apiUrl = document.getElementById('apiUrl').value;
        const apiKey = document.getElementById('apiKey').value;

        if (!apiUrl || !apiKey) {
            alert("Please enter both API URL and API Key to test connection.");
            return;
        }

        try {
            const testResult = await ApiTest.testConnection(apiUrl, apiKey); // Test the API connection
            alert(testResult.success ? "Connection successful!" : `Connection failed: ${testResult.message}`);
        } catch (error) {
            alert(`Error testing connection: ${error.message}`);
        }
    }
}

/**
 * ApiTest is responsible for testing the connection to the DeepL API by sending a request to the translation endpoint.
 */
class ApiTest {

    /**
     * Tests the connection to the DeepL API by sending a sample translation request.
     * Returns a success or failure message.
     */
    static async testConnection(apiUrl, apiKey) {
        return fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                q: 'Hello',
                source: 'en',
                api_key: apiKey,
                target: 'es',
                format: 'text'
            }),
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.translatedText) {
                    const statusMessage = data.response?.status || 'Successfully';
                    return {success: true, message: `Success ${statusMessage}`};
                } else {
                    return {success: false, message: data.error || 'Unknown API error'};
                }
            })
            .catch(error => {
                return {success: false, message: error.message};
            });
    }
}



