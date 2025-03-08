chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        translateText(request.text, request.targetLanguage, request.apiUrl, request.apiKey).then((translatedText) => {
            sendResponse({ translatedText: translatedText });
        }).catch(err => {
            sendResponse({ translatedText: 'Translation error' });
        });
        return true;
    }
});

async function translateText(text, targetLanguage, apiUrl, apiKey) {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            q: text,
            source: 'auto',
            api_key: apiKey,
            target: targetLanguage,
            format: 'text'
        }),
    });

    const data = await response.json();

    if (data.error) {
        console.error('Translation API error:', data.error);
        return `Error: ${data.error}`;
    }

    return data.translatedText;
}