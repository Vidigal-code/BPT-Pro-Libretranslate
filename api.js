/**
 * Listens for messages from the extension and handles different actions.
 * @param {Object} message - The message object containing action and data.
 * @param {Object} sender - The sender of the message.
 * @param {Function} sendResponse - Function to send a response back to the sender.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translate') {
        translateText(message.text, message.targetLanguage, message.apiUrl, message.apiKey)
            .then(translatedText => sendResponse({ translatedText }))
            .catch(error => sendResponse({ error: { message: error.message || 'Translation error' } }));
        return true;
    }

    if (message.action === 'testConnection') {
        testConnection(message.apiUrl, message.apiKey)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, message: error.message || 'Unknown error' }));
        return true;
    }
});

/**
 * Translates the given text to the target language using the translation API.
 * @param {string} text - The text to translate.
 * @param {string} targetLanguage - The target language code (e.g., 'EN', 'DE').
 * @param {string} apiUrl - The URL of the translation API.
 * @param {string} apiKey - The API key for authentication.
 * @param {number} retryCount - Number of retries attempted (default 0).
 * @param {number} maxRetries - Maximum number of retries (default 3).
 * @returns {Promise<string>} - A promise that resolves to the translated text.
 */
async function translateText(text, targetLanguage, apiUrl, apiKey, retryCount = 0, maxRetries = 3) {
    try {
        if (!text || !targetLanguage || !apiUrl || !apiKey) {
            throw new Error('Missing required parameters');
        }

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

        if (!response.ok) {
            if (response.status === 429 && retryCount < maxRetries) {
                const retryAfter = response.headers.get('Retry-After') || Math.pow(2, retryCount) * 1000; // Exponential backoff
                console.warn(`Rate limit exceeded. Retrying after ${retryAfter}ms...`);
                await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter)));
                return translateText(text, targetLanguage, apiUrl, apiKey, retryCount + 1, maxRetries);
            }
            throw new Error(
                response.status === 429
                    ? 'Rate limit exceeded. Please try again later or use a different API instance.'
                    : `HTTP error! Status: ${response.status}`
            );
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'Translation API error');
        }

        if (!data.translatedText) {
            throw new Error('No translated text returned');
        }

        return data.translatedText;
    } catch (error) {
        console.error('Translation error:', error);
        throw error;
    }
}

/**
 * Tests the connection to the specified API.
 * @param {string} apiUrl - The URL of the API.
 * @param {string} apiKey - The API key for authentication.
 * @returns {Promise<Object>} - A promise that resolves to the test result.
 */
async function testConnection(apiUrl, apiKey) {
    try {
        if (!apiUrl || !apiKey) {
            throw new Error('Missing API URL or API Key');
        }

        const response = await fetch(apiUrl, {
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
        });

        if (!response.ok) {
            throw new Error(
                response.status === 429
                    ? 'Rate limit exceeded during connection test. Please try again later.'
                    : `HTTP error! Status: ${response.status}`
            );
        }

        const data = await response.json();

        if (data.translatedText) {
            return { success: true, message: `Success: ${data.response?.status || 'Connected'}` };
        } else {
            throw new Error(data.error || 'Unknown API error');
        }
    } catch (error) {
        console.error('Test connection error:', error);
        return { success: false, message: error.message || 'Connection failed' };
    }
}