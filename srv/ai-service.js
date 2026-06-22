const cds = require('@sap/cds');
const path = require('path');
const fs = require('fs');
const { callClaude } = require(path.join(__dirname, 'lib', 'claude'));
const preAssessment = require(path.join(__dirname, 'lib', 'pre-assessment'));
const quoteCache = require(path.join(__dirname, 'lib', 'quote-cache'));

// Load business context once at startup — injected into every AI call
let businessContext = '';
try {
    const ctx = JSON.parse(fs.readFileSync(path.join(__dirname, 'context', 'business-context.json'), 'utf8'));
    businessContext = '\n\nBUSINESS CONTEXT (always apply this knowledge):\n' + JSON.stringify(ctx, null, 2);
    console.log('[AI] Business context loaded (' + businessContext.length + ' chars)');
} catch(e) {
    console.warn('[AI] No business context file found:', e.message);
}

function buildSystem(role) {
    return role + businessContext;
}

module.exports = cds.service.impl(async function () {

    // Start pre-assessment engine on service init
    const apiKey = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
    preAssessment.start(cds, businessContext, apiKey);
    quoteCache.start(cds);

    this.on('analyze', async (req) => {
        const { question, summary } = req.data;
        const key = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = buildSystem('You are a senior sales analyst for Trelleborg Sealing Solutions (TSS). Answer concisely with sharp insight. Use <b> for numbers, <br> for line breaks. No markdown. Only reference data that is explicitly provided — never invent numbers or organisations.');
        return await callClaude(system, 'Data: ' + summary + '\n\nQuestion: ' + question, key);
    });

    this.on('generateBrief', async (req) => {
        const { audience, intent, data } = req.data;
        const key = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = buildSystem('You are a senior sales strategist for Trelleborg Sealing Solutions (TSS). Generate a polished, audience-specific sales brief from C4C opportunity data. Return ONLY valid JSON, no markdown, no code blocks. Structure: {"title":"string","headline":"one powerful sentence summarising the pipeline story","narrative":["paragraph1","paragraph2","paragraph3"],"recommendations":["actionable rec 1","rec 2","rec 3","rec 4"],"alerts":["key risk or attention item 1","item 2"],"highlights":[{"label":"string","value":"string","context":"string"}]}. Rules: Tailor tone and content strictly to the audience. Board/Executive = strategic, revenue-focused, concise. Customer Meeting = value-oriented, opportunity-focused, positive. Regional Manager = operational, owner/phase detail, action-oriented. Sales Team = motivational, win rate, pipeline health. Territory Review = geographic breakdown, org performance. highlights = 4 key metrics. narrative = 3 paragraphs of flowing prose with real numbers. recommendations = 4 specific actionable items. alerts = 2 risks. All numbers rounded, currency formatted as $1.2M. Only use numbers and organisations present in the data provided — never hallucinate.');
        return await callClaude(system, 'Audience: ' + audience + '\nIntent: ' + intent + '\nSales data: ' + data, key);
    });

    this.on('buildReport', async (req) => {
        const { question, data } = req.data;
        const key = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        const system = buildSystem('You are a senior data visualization expert for TSS sales intelligence. User describes a report in plain English. You receive aggregated C4C opportunity data. Return ONLY valid JSON, no markdown, no explanation, no code blocks. JSON structure: {"reportTitle":"string","reportType":"executive_summary|chart_report|mixed","insight":"3-5 sentences specific to the question with real numbers from the data","supportingCharts":["relevant items from: revenue, winRate, phase, reasons, owners, trend"],"primaryChart":{"title":"string","chartType":"bar|horizontalBar|line|doughnut","labels":[],"datasets":[{"label":"string","data":[],"backgroundColor":"#color or array of colors"}]}}. Rules: For executive summary or overview questions set reportType to executive_summary and primaryChart to null with 5+ sentence insight. For specific chart questions pick the most relevant chartType. supportingCharts max 4. SAP colors: #0a6ed1 blue #107e3e green #e9730c orange #bb0000 red #6c32a9 purple #0e7e76 teal #c2781f gold. For bar charts use array of SAP colors one per bar. Round all numbers. Max 10 labels. Only reference data explicitly in the provided dataset.');
        return await callClaude(system, 'Sales data: ' + data + '\n\nBuild this report: ' + question, key);
    });

    this.on('getSnapshot', async (req) => {
        const { cache, status, lastComputed, error } = preAssessment.getCache();
        return JSON.stringify({ cache, status, lastComputed, error });
    });

    this.on('refreshSnapshot', async (req) => {
        const key = process.env.ANTHROPIC_API_KEY || cds.env.ANTHROPIC_API_KEY;
        preAssessment.start(cds, businessContext, key);
        return JSON.stringify({ triggered: true, message: 'Snapshot refresh triggered. Check getSnapshot in a few seconds.' });
    });
});
