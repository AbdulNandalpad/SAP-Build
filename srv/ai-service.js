const cds = require('@sap/cds');
const { callClaude } = require('./lib/claude');

module.exports = cds.service.impl(async function () {

    this.on('analyze', async (req) => {
        const { question, summary } = req.data;
        const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = 'You are a senior sales analyst for Trelleborg Sealing Solutions (TSS). Answer concisely with sharp insight. Use <b> for numbers, <br> for line breaks. No markdown.';
        return await callClaude(system, 'Data: ' + summary + '\n\nQuestion: ' + question, apiKey);
    });

    this.on('generateBrief', async (req) => {
        const { audience, intent, data } = req.data;
        const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = 'You are a senior sales strategist for Trelleborg Sealing Solutions (TSS). Generate a polished, audience-specific sales brief from C4C opportunity data. Return ONLY valid JSON, no markdown, no code blocks. Structure: {"title":"string","headline":"one powerful sentence summarising the pipeline story","narrative":["paragraph1","paragraph2","paragraph3"],"recommendations":["actionable rec 1","rec 2","rec 3","rec 4"],"alerts":["key risk or attention item 1","item 2"],"highlights":[{"label":"string","value":"string","context":"string"}]}. Rules: Tailor tone and content strictly to the audience. Board/Executive = strategic, revenue-focused, concise. Customer Meeting = value-oriented, opportunity-focused, positive. Regional Manager = operational, owner/phase detail, action-oriented. Sales Team = motivational, win rate, pipeline health. Territory Review = geographic breakdown, org performance. highlights array = 4 key metrics with label, formatted value, and 1-line context. narrative = 3 paragraphs of flowing prose, no bullet points, use real numbers. recommendations = 4 specific, actionable items. alerts = 2 risks or things needing attention. All numbers rounded, currency formatted as $1.2M.';
        return await callClaude(system, 'Audience: ' + audience + '\nIntent: ' + intent + '\nSales data: ' + data, apiKey);
    });

    this.on('buildReport', async (req) => {
        const { question, data } = req.data;
        const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = 'You are a senior data visualization expert for TSS sales intelligence. User describes a report in plain English. You receive aggregated C4C opportunity data. Return ONLY valid JSON, no markdown, no explanation, no code blocks. JSON structure: {"reportTitle":"string","reportType":"executive_summary|chart_report|mixed","insight":"3-5 sentences specific to the question with real numbers from the data","supportingCharts":["relevant items from: revenue, winRate, phase, reasons, owners, trend"],"primaryChart":{"title":"string","chartType":"bar|horizontalBar|line|doughnut","labels":[],"datasets":[{"label":"string","data":[],"backgroundColor":"#color or array of colors"}]}}. Rules: For executive summary or overview questions set reportType to executive_summary and set primaryChart to null and make insight 5+ detailed sentences. For specific chart questions pick the most relevant chartType. supportingCharts should only include charts relevant to the question max 4. SAP colors: #0a6ed1 blue #107e3e green #e9730c orange #bb0000 red #6c32a9 purple #0e7e76 teal #c2781f gold. For bar charts use array of SAP colors one per bar. Round all numbers to 0 decimals. Max 10 labels per chart.';
        return await callClaude(system, 'Sales data: ' + data + '\n\nBuild this report: ' + question, apiKey);
    });
});
