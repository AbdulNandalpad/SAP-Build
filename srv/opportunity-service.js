const cds = require('@sap/cds');
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

async function fetchAllFromC4C(c4c, basePath) {
    let all = [];
    let path = basePath;
    let page = 0;
    const maxPages = 20;
    while (path && page < maxPages) {
        const result = await c4c.send({ method: 'GET', path });
        const records = Array.isArray(result) ? result : (result.value || result);
        if (!records || records.length === 0) break;
        all = all.concat(records);
        page++;
        const nextLink = result['@odata.nextLink'] || result['odata.nextLink'];
        if (nextLink && records.length >= 1000) {
            const skip = all.length;
            path = basePath + '&\$skip=' + skip;
        } else {
            break;
        }
    }
    console.log('[CAP] Opportunities: ' + all.length + ' records fetched in ' + page + ' pages');
    return all;
}

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c');

    this.on('READ', 'Opportunities', async (req) => {
        const top = req.query.SELECT && req.query.SELECT.limit && req.query.SELECT.limit.rows && req.query.SELECT.limit.rows.val;
        // If browser requests a specific small top (like $top=3 for testing), honour it
        const SEL = "ObjectID,ID,Name,SalesOrganisationID,SalesOrganisationName,SalesCyclePhaseCode,SalesCyclePhaseCodeText,SalesCyclePhaseStartDate,ExpectedRevenueAmount,ExpectedRevenueAmountCurrencyCode,ExpectedProcessingEndDate,LifeCycleStatusCode,LifeCycleStatusCodeText,ResultReasonCode,ResultReasonCodeText,ProbabilityPercent,ProspectPartyID,ProspectPartyName,MainEmployeeResponsiblePartyName,CreationDate,LastChangeDate,ProcessingTypeCode,ProcessingTypeCodeText,OpportunityLevel_KUT,OpportunityLevel_KUTText,BUS_SEG_CDE_KUT,BUS_SEG_CDE_KUTText,CustomerABCClassificationCode_PSM,CustomerABCClassificationCode_PSMText,ZHasCompetitor_KUT,ZHasSummary_KUT,ZHasSupplier_KUT";
        if (top && top <= 100) {
            const result = await c4c.send({
                method: 'GET',
                path: "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=" + top + "&$select=" + SEL
            });
            return Array.isArray(result) ? result : (result.value || result);
        }
        // Otherwise fetch all pages
        const basePath = "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=1000&$select=" + SEL;
        return await fetchAllFromC4C(c4c, basePath);
    });

    this.on('analyze', async (req) => {
        const { question, summary } = req.data;
        const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = 'You are a senior sales analyst for Trelleborg Sealing Solutions (TSS). Answer concisely with sharp insight. Use <b> for numbers, <br> for line breaks. No markdown.';
        return await callClaude(system, 'Data: ' + summary + '\n\nQuestion: ' + question, apiKey);
    });

    this.on('buildReport', async (req) => {
        const { question, data } = req.data;
        const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = 'You are a senior data visualization expert for TSS sales intelligence. User describes a report in plain English. You receive aggregated C4C opportunity data. Return ONLY valid JSON, no markdown, no explanation, no code blocks. JSON structure: {"reportTitle":"string","reportType":"executive_summary|chart_report|mixed","insight":"3-5 sentences specific to the question with real numbers from the data","supportingCharts":["relevant items from: revenue, winRate, phase, reasons, owners, trend"],"primaryChart":{"title":"string","chartType":"bar|horizontalBar|line|doughnut","labels":[],"datasets":[{"label":"string","data":[],"backgroundColor":"#color or array of colors"}]}}. Rules: For executive summary or overview questions set reportType to executive_summary and set primaryChart to null and make insight 5+ detailed sentences. For specific chart questions pick the most relevant chartType. supportingCharts should only include charts relevant to the question max 4. SAP colors: #0a6ed1 blue #107e3e green #e9730c orange #bb0000 red #6c32a9 purple #0e7e76 teal #c2781f gold. For bar charts use array of SAP colors one per bar. Round all numbers to 0 decimals. Max 10 labels per chart.';
        return await callClaude(system, 'Sales data: ' + data + '\n\nBuild this report: ' + question, apiKey);
    });
});