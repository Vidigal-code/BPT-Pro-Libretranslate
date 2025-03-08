let isPluginActive = false;

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['targetLanguage', 'apiUrl', 'apiKey', 'isPluginActive'], (result) => {
        document.getElementById('languageSelect').value = result.targetLanguage || 'en';
        document.getElementById('apiUrl').value = result.apiUrl || '';
        document.getElementById('apiKey').value = result.apiKey || '';
        isPluginActive = result.isPluginActive;
        updatePluginButton();
    });
});


document.getElementById('saveButton').addEventListener('click', () => {
    const selectedLanguage = document.getElementById('languageSelect').value;
    const apiUrl = document.getElementById('apiUrl').value;
    const apiKey = document.getElementById('apiKey').value;

    chrome.storage.local.set({targetLanguage: selectedLanguage, apiUrl, apiKey}, () => {
        alert('Settings saved successfully');
    });
});


document.getElementById('togglePluginButton').addEventListener('click', () => {
    isPluginActive = !isPluginActive;
    chrome.storage.local.set({isPluginActive}, () => {
        updatePluginButton();
        chrome.runtime.sendMessage({action: 'updatePluginStatus', isActive: isPluginActive});
        alert(`Plugin ${isPluginActive ? 'Activated' : 'Deactivated'}`);
    });
});


document.getElementById('testConnectionButton').addEventListener('click', async () => {
    const apiUrl = document.getElementById('apiUrl').value;
    const apiKey = document.getElementById('apiKey').value;

    if (!apiUrl || !apiKey) {
        alert("Please enter both API URL and API Key to test connection.");
        return;
    }

    const testResult = await testApiConnection(apiUrl, apiKey);
    testResult.success ? alert("Connection successful! API is working correctly.") : alert(`Connection failed: ${testResult.message}`);
});


async function testApiConnection(apiUrl, apiKey) {
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

function updatePluginButton() {
    const statusButton = document.getElementById('togglePluginButton');
    statusButton.innerHTML = `Plugin Status: <strong>${isPluginActive ? 'Active' : 'Inactive'}</strong>`;
}