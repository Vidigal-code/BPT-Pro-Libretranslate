document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['targetLanguage', 'apiUrl', 'apiKey'], (result) => {
        document.getElementById('languageSelect').value = result.targetLanguage || 'en';
        document.getElementById('apiUrl').value = result.apiUrl || '';
        document.getElementById('apiKey').value = result.apiKey || '';
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
