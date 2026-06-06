const https = require('https');

function callClaude(system, prompt, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            system: system,
            messages: [{ role: 'user', content: prompt }]
        });
        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const r = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
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
