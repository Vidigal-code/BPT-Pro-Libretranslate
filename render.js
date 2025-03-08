const storageAPI =
    (typeof chrome !== "undefined" && chrome.storage)
        ? chrome.storage : browser.storage;

const state = {
    isTranslationSent: false,
    isPluginActive: false,
    isFloatingButtonVisible: false,
    currentTargetLanguage: 'en'
};

const availableLanguages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ar': 'Arabic'
};


function isExtensionContextValid() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
}


function initPluginState() {
    if (!isExtensionContextValid()) {
        handleExtensionError(new Error("Extension context invalidated"));
        return;
    }

    storageAPI.local.get(['isPluginActive', 'targetLanguage', 'isFloatingButtonVisible'], (result) => {
        if (chrome.runtime.lastError) {
            alert("Error accessing storage:" + " " + chrome.runtime.lastError.message);
            return;
        }

        state.isPluginActive = result.isPluginActive;
        state.currentTargetLanguage = result.targetLanguage || 'en';
        state.isFloatingButtonVisible = result.isFloatingButtonVisible;
    });
}


function setupStorageListener() {
    if (!isExtensionContextValid()) {
        handleExtensionError(new Error("Extension context invalidated"));
        return;
    }

    storageAPI.onChanged.addListener((changes) => {
        if (changes.isPluginActive) {
            state.isPluginActive = changes.isPluginActive.newValue;
        }
        if (changes.targetLanguage) {
            state.currentTargetLanguage = changes.targetLanguage.newValue;
        }
        if (changes.isFloatingButtonVisible) {
            state.isFloatingButtonVisible = changes.isFloatingButtonVisible.newValue;
        }
    });
}


function setupMessageListener() {
    if (!isExtensionContextValid()) {
        handleExtensionError(new Error("Extension context invalidated"));
        return;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'updatePluginStatus') {
            state.isPluginActive = message.isActive;
        }
    });
}


function setupSelectionChangeListener() {
    document.addEventListener('selectionchange', () => {
        state.isTranslationSent = false;
    });
}


async function getConfiguration() {

    if (!isExtensionContextValid() || typeof storageAPI.local === "undefined") {
        handleExtensionError(new Error("Extension context invalidated"));
        return {
            targetLanguage: 'en',
            apiUrl: '',
            apiKey: ''
        };
    }

    return new Promise((resolve, reject) => {
        storageAPI.local.get(['targetLanguage', 'apiUrl', 'apiKey'], (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error("Error accessing storage: " + chrome.runtime.lastError.message));
                return;
            }

            resolve({
                targetLanguage: state.currentTargetLanguage || result.targetLanguage || 'en',
                apiUrl: result.apiUrl || '',
                apiKey: result.apiKey || ''
            });
        });
    }).catch(error => {
        handleExtensionError(error);
        return {
            targetLanguage: 'en',
            apiUrl: '',
            apiKey: ''
        };
    });
}


function handleExtensionError(error) {
    if (error.message.includes('Extension context invalidated')) {
        showErrorBanner("The extension has been updated or reloaded. Please refresh the page to continue using it.");
    }
}


function showErrorBanner(message) {

    const existingBanner = document.querySelector('.translation-error-banner');

    if (existingBanner) {
        existingBanner.textContent = message;
        return;
    }

    const banner = document.createElement('div');
    banner.className = 'translation-error-banner';
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.backgroundColor = '#f44336';
    banner.style.color = 'white';
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
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.verticalAlign = 'middle';
    closeButton.addEventListener('click', () => banner.remove());

    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh';
    refreshButton.style.marginLeft = '10px';
    refreshButton.style.padding = '5px 10px';
    refreshButton.style.background = 'white';
    refreshButton.style.color = '#f44336';
    refreshButton.style.border = 'none';
    refreshButton.style.borderRadius = '3px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.addEventListener('click', () => window.location.reload());

    banner.appendChild(refreshButton);
    banner.appendChild(closeButton);
    document.body.appendChild(banner);

}


function sendTranslationRequest(text, config) {
    if (!isExtensionContextValid()) {
        handleExtensionError(new Error("Extension context invalidated"));
        return Promise.reject(new Error("Extension context invalidated"));
    }

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'translate',
            text: text,
            targetLanguage: config.targetLanguage,
            apiUrl: config.apiUrl,
            apiKey: config.apiKey
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    }).catch(error => {
        alert("Error sending translation request:" + " " + error);
        if (error.message.includes('Extension context invalidated')) {
            handleExtensionError(error);
        }
        return Promise.reject(error);
    });
}


async function handleTextSelection() {
    if (!state.isPluginActive) return;

    const selectedText = window.getSelection().toString().trim();
    if (!selectedText || state.isTranslationSent) return;

    const config = await getConfiguration();

    if (!config.apiUrl || !config.apiKey) {
        alert("Please configure the API URL and API Key in the settings.");
        return;
    }

    sendTranslationRequest(selectedText, config)
        .then(response => {
            if (response && response.translatedText) {
                showTranslationPopup(response.translatedText, selectedText);
                state.isTranslationSent = true;
            } else {
                alert("Error receiving translation response:" + " " + response?.error.message);
            }
        })
        .catch(error => {
            alert("Error processing translation:" + " " + error);
            if (error.message.includes('Extension context invalidated')) {
                handleExtensionError(error);
            }
        });
}


function showTranslationPopup(translatedText, originalText) {
    if (!state.isPluginActive) return;

    const existingPopup = document.querySelector('.translation-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.className = 'translation-popup';
    popup.dataset.originalText = originalText;

    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-header">
                <select class="language-selector">
                    ${Object.entries(availableLanguages).map(([code, name]) =>
        `<option value="${code}" ${code === state.currentTargetLanguage ? 'selected' : ''}>${name}</option>`).join('')}
                </select>
                <button class="close-btn">&times;</button>
            </div>
            <p>${translatedText}</p>
        </div>
    `;

    applyPopupStyles(popup);

    const languageSelector = popup.querySelector('.language-selector');
    languageSelector.addEventListener('change', async (e) => {
        const newText = await retranslateText(popup, e.target.value).catch(error => {
            alert("Error retranslating text:" + " " + error.message);
            return 'Translation error: ' + error.message;
        });

        popup.querySelector('p').textContent = newText || 'Translation error';
        resetPopupTimeout(popup);
    });

    const closeButton = popup.querySelector('.close-btn');
    closeButton.addEventListener('click', () => popup.remove());

    document.body.appendChild(popup);
    setPopupTimeout(popup);
}


async function retranslateText(popup, newLanguage) {

    if (!isExtensionContextValid()) {
        handleExtensionError(new Error("Extension context invalidated"));
        return Promise.reject(new Error("Extension context invalidated"));
    }

    const originalText = popup.dataset.originalText;
    const config = await getConfiguration();

    config.targetLanguage = newLanguage;
    state.currentTargetLanguage = newLanguage;

    storageAPI.local.set({targetLanguage: newLanguage}, () => {
        if (chrome.runtime.lastError) {
            alert("Error saving language preference:" + " " + chrome.runtime.lastError.message);
        }
    });

    const response = await sendTranslationRequest(originalText, config);
    return response.translatedText;
}


function setPopupTimeout(popup) {
    popup.timeoutId = setTimeout(() => {
        if (document.body.contains(popup)) {
            popup.remove();
        }
    }, 15000);
}


function resetPopupTimeout(popup) {
    clearTimeout(popup.timeoutId);
    setPopupTimeout(popup);
}


function applyPopupStyles(popup) {

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


function setupHeartbeat() {
    const heartbeatInterval = setInterval(() => {
        if (!isExtensionContextValid()) {
            clearInterval(heartbeatInterval);
            handleExtensionError(new Error("Extension context invalidated"));
        }
    }, 30000);
}


function init() {

    if (!isExtensionContextValid()) {
        handleExtensionError(new Error("Extension context invalidated"));
        return;
    }

    initPluginState();
    setupStorageListener();
    setupMessageListener();
    setupSelectionChangeListener();
    setupHeartbeat();
    document.addEventListener('mouseup', handleTextSelection);
}

init();