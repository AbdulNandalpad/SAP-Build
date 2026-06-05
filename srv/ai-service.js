const cds = require('@sap/cds')
const https = require('https')

module.exports = cds.service.impl(async function () {
    this.on('analyze', async (req) => {
        const { question, summary } = req.data
        const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY

        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                system: 'You are a senior sales analyst for Trelleborg Sealing Solutions (TSS). Answer concisely with sharp insight. Use <b> for numbers, <br> for line breaks. No markdown.',
                messages: [{ role: 'user', content: 'Data: ' + summary + '\n\nQuestion: ' + question }]
            })
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
            }
            const r = https.request(options, res => {
                let data = ''
                res.on('data', chunk => data += chunk)
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data)
                        if(json.error) reject(new Error(json.error.message))
                        else resolve(json.content[0].text)
                    } catch(e) { reject(e) }
                })
            })
            r.on('error', reject)
            r.write(body)
            r.end()
        })
    })
})
