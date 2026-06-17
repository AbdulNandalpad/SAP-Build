const https = require('https');

// Azure AI Foundry endpoint — Anthropic-native format
const AZURE_HOST = 'azr-fou-sc-cx.services.ai.azure.com';
const AZURE_PATH = '/anthropic/v1/messages';

function callClaude(system, prompt, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: system,
            messages: [{ role: 'user', content: prompt }]
        });
        const options = {
            hostname: AZURE_HOST,
            path: AZURE_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        console.log('[Azure] key prefix:', apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING');
        const r = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[Azure] status:', res.statusCode, 'body:', data.substring(0, 300));
                try {
                    const json = JSON.parse(data);
                    if (json.error) reject(new Error(json.error.message));
                    else resolve(json.content[0].text);
                } catch(e) { reject(e); }
            });
        });
        r.on('error', reject);
        r.write(body);
        r.end();
    });
}

module.exports = { callClaude };
