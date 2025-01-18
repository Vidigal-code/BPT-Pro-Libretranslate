let isPluginActive = true;

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['targetLanguage', 'apiUrl', 'apiKey', 'isPluginActive'], (result) => {
        document.getElementById('languageSelect').value = result.targetLanguage || 'en';
        document.getElementById('apiUrl').value = result.apiUrl || '';
        document.getElementById('apiKey').value = result.apiKey || '';
        isPluginActive = result.isPluginActive !== undefined ? result.isPluginActive : true;
        updatePluginButton();
    });
});

document.getElementById('saveButton').addEventListener('click', () => {
    const selectedLanguage = document.getElementById('languageSelect').value;
    const apiUrl = document.getElementById('apiUrl').value;
    const apiKey = document.getElementById('apiKey').value;

    chrome.storage.local.set({ targetLanguage: selectedLanguage, apiUrl, apiKey }, () => {
        alert('Settings saved successfully');
    });
});

document.getElementById('togglePluginButton').addEventListener('click', () => {
    isPluginActive = !isPluginActive;
    chrome.storage.local.set({ isPluginActive }, () => {
        updatePluginButton();
        chrome.runtime.sendMessage({ action: 'updatePluginStatus', isActive: isPluginActive });
        alert(`Plugin ${isPluginActive ? 'Activated' : 'Deactivated'}`);
    });
});

function updatePluginButton() {
    const statusButton = document.getElementById('togglePluginButton');
    statusButton.innerHTML = `Plugin Status: <strong>${isPluginActive ? 'Active' : 'Inactive'}</strong>`;
}
