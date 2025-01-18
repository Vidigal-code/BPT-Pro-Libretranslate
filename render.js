const storageAPI = (typeof chrome !== "undefined" && chrome.storage) ? chrome.storage : browser.storage;

let isTranslationSent = false;
let isPluginActive = true;

chrome.storage.local.get(['isPluginActive'], (result) => {
    isPluginActive = result.isPluginActive !== undefined ? result.isPluginActive : true;
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.isPluginActive) {
        isPluginActive = changes.isPluginActive.newValue;
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updatePluginStatus') {
        isPluginActive = message.isActive;
    }
});


document.addEventListener('selectionchange', () => {
    isTranslationSent = false;
});


document.addEventListener('mouseup', async () => {
    if (!isPluginActive) return;

    const selectedText = window.getSelection().toString().trim();

    if (selectedText && !isTranslationSent) {
        storageAPI.local.get(['targetLanguage', 'apiUrl', 'apiKey'], (result) => {
            const targetLanguage = result.targetLanguage || 'en';
            const apiUrl = result.apiUrl || '';
            const apiKey = result.apiKey || '';

            if (apiUrl && apiKey) {
                chrome.runtime.sendMessage({
                    action: 'translate',
                    text: selectedText,
                    targetLanguage: targetLanguage,
                    apiUrl: apiUrl,
                    apiKey: apiKey
                }, (response) => {
                    if (response && response.translatedText) {
                        showTranslationPopup(response.translatedText);
                        isTranslationSent = true;
                    } else {
                        console.error('Error receiving translation response:', response);
                    }
                });
            } else {
                alert("Please configure the API URL and API Key in the settings.");
            }
        });
    }
});

function showTranslationPopup(translatedText) {
    if (!isPluginActive) return;

    const popup = document.createElement('div');
    popup.className = 'translation-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <p>${translatedText}</p>
            <button class="close-btn">Close</button>
        </div>
    `;

    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    popup.style.color = '#fff';
    popup.style.padding = '20px';
    popup.style.borderRadius = '8px';
    popup.style.zIndex = '10000';

    const closeButton = popup.querySelector('.close-btn');
    closeButton.style.backgroundColor = '#ff4d4d';
    closeButton.style.color = '#fff';
    closeButton.style.marginTop = '15px';
    closeButton.style.border = 'none';
    closeButton.style.padding = '8px 15px';
    closeButton.style.borderRadius = '5px';
    closeButton.style.cursor = 'pointer';

    closeButton.addEventListener('click', () => {
        popup.remove();
    });

    document.body.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 15000);
}
