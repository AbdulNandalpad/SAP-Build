/**
 * Pre-assessment engine.
 * Runs once on startup and every 6 hours after that.
 * Fetches all opportunities from C4C, computes metrics in JS,
 * then calls AI once on the small summary — result stored in memory.
 * Users get instant responses; AI is never called per-user-request for standard KPIs.
 */

const { callClaude } = require('./claude');
const { computeSummary } = require('./opp-summary');

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STALE_THRESHOLD_DAYS = 90;

let _cache = null;
let _status = 'pending'; // pending | computing | ready | error
let _lastComputed = null;
let _error = null;

function getCache() {
    return { cache: _cache, status: _status, lastComputed: _lastComputed, error: _error };
}

// ─── Pure JS metrics — no AI, instant ───────────────────────────────────────

function computeMetrics(opps) {
    const now = new Date();

    const active = opps.filter(o => o.LifeCycleStatusCode === '1' || o.LifeCycleStatusCode === '2');
    const won    = opps.filter(o => o.LifeCycleStatusCode === '3');
    const lost   = opps.filter(o => o.LifeCycleStatusCode === '5');

    // EUR pipeline value (use ZBaseCurrency_KUTContent_KUT where available, fallback 0)
    const toEur = o => parseFloat(o.ZBaseCurrency_KUTContent_KUT || 0);
    const sum   = arr => arr.reduce((t, o) => t + toEur(o), 0);

    const totalPipelineEur = sum(active);
    const wonEur           = sum(won);
    const lostEur          = sum(lost);

    // Win rate (by count, among closed)
    const closed = won.length + lost.length;
    const winRate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

    // Average probability on active deals (excluding 0%)
    const qualified = active.filter(o => parseFloat(o.ProbabilityPercent || 0) > 0);
    const avgProb   = qualified.length > 0
        ? Math.round(qualified.reduce((t, o) => t + parseFloat(o.ProbabilityPercent), 0) / qualified.length)
        : 0;

    // By segment
    const bySegment = {};
    active.forEach(o => {
        const seg = o.BUS_SEG_CDE_KUTText || o.BUS_SEG_CDE_KUT || 'Unknown';
        if (!bySegment[seg]) bySegment[seg] = { count: 0, eur: 0 };
        bySegment[seg].count++;
        bySegment[seg].eur += toEur(o);
    });

    // By org (top 10 by EUR)
    const byOrg = {};
    active.forEach(o => {
        const org = o.SalesOrganisationName || o.SalesOrganisationID || 'Unknown';
        if (!byOrg[org]) byOrg[org] = { count: 0, eur: 0 };
        byOrg[org].count++;
        byOrg[org].eur += toEur(o);
    });
    const topOrgs = Object.entries(byOrg)
        .sort((a, b) => b[1].eur - a[1].eur)
        .slice(0, 10)
        .map(([name, d]) => ({ name, count: d.count, eur: Math.round(d.eur) }));

    // By phase
    const byPhase = {};
    active.forEach(o => {
        const ph = o.SalesCyclePhaseCodeText || o.SalesCyclePhaseCode || 'Unknown';
        if (!byPhase[ph]) byPhase[ph] = 0;
        byPhase[ph]++;
    });

    // Top 10 by EUR value
    const top10 = [...active]
        .filter(o => toEur(o) > 0)
        .sort((a, b) => toEur(b) - toEur(a))
        .slice(0, 10)
        .map(o => ({
            id: o.ID,
            name: o.Name,
            account: o.ProspectPartyName,
            owner: o.MainEmployeeResponsiblePartyName,
            org: o.SalesOrganisationName,
            phase: o.SalesCyclePhaseCodeText,
            eur: Math.round(toEur(o)),
            status: o.LifeCycleStatusCodeText,
            probability: parseFloat(o.ProbabilityPercent || 0)
        }));

    // Stale deals (active, last change > 90 days ago)
    const stale = active.filter(o => {
        const last = new Date(o.LastChangeDate || o.CreationDate);
        return (now - last) / 86400000 > STALE_THRESHOLD_DAYS;
    }).map(o => ({
        id: o.ID, name: o.Name, account: o.ProspectPartyName,
        owner: o.MainEmployeeResponsiblePartyName, org: o.SalesOrganisationName,
        eur: Math.round(toEur(o)), daysSinceChange: Math.round((now - new Date(o.LastChangeDate || o.CreationDate)) / 86400000)
    })).sort((a, b) => b.eur - a.eur).slice(0, 15);

    // At-risk: high value + low probability
    const atRisk = active.filter(o => {
        const eur  = toEur(o);
        const prob = parseFloat(o.ProbabilityPercent || 0);
        return eur > 100000 && prob > 0 && prob < 30;
    }).map(o => ({
        id: o.ID, name: o.Name, account: o.ProspectPartyName,
        owner: o.MainEmployeeResponsiblePartyName, org: o.SalesOrganisationName,
        eur: Math.round(toEur(o)), probability: parseFloat(o.ProbabilityPercent)
    })).sort((a, b) => b.eur - a.eur).slice(0, 10);

    // Data quality flags
    const noSummary     = active.filter(o => !o.ZHasSummary_KUT || o.ZHasSummary_KUT === 'false' || o.ZHasSummary_KUT === false);
    const noSOP         = active.filter(o => !o.ExpectedProcessingEndDate);
    const zeroProb      = active.filter(o => parseFloat(o.ProbabilityPercent || 0) === 0);
    const noResultReason = [...won, ...lost].filter(o => !o.ResultReasonCode);
    const confidential  = active.filter(o => o.ZConfidential_SDK === true || o.ZConfidential_SDK === 'true');

    // By result reason (won/lost)
    const byResultReason = {};
    [...won, ...lost].filter(o => o.ResultReasonCodeText).forEach(o => {
        const key = o.ResultReasonCodeText;
        if (!byResultReason[key]) byResultReason[key] = { won: 0, lost: 0 };
        if (o.LifeCycleStatusCode === '3') byResultReason[key].won++;
        else byResultReason[key].lost++;
    });

    return {
        summary: {
            totalOpportunities: opps.length,
            activeCount: active.length,
            wonCount: won.length,
            lostCount: lost.length,
            totalPipelineEur: Math.round(totalPipelineEur),
            wonEur: Math.round(wonEur),
            winRate,
            avgProbability: avgProb,
            confidentialCount: confidential.length
        },
        bySegment,
        topOrgs,
        byPhase,
        top10,
        alerts: {
            staleDeals: stale,
            atRisk,
            dataQuality: {
                noSummaryCount: noSummary.length,
                noSOPCount: noSOP.length,
                zeroProbCount: zeroProb.length,
                noResultReasonCount: noResultReason.length
            }
        },
        byResultReason
    };
}

function fmtEur(n) {
    if (n >= 1000000) return '€' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '€' + Math.round(n / 1000) + 'K';
    return '€' + n;
}

// ─── AI narrative — runs once on the small metrics object ────────────────────

async function runAINarrative(metrics, businessContext, apiKey) {
    const segLines = Object.entries(metrics.bySegment)
        .map(([s, d]) => `${s}: ${d.count} deals, ${fmtEur(d.eur)}`).join('; ');
    const orgLines = metrics.topOrgs.slice(0, 5)
        .map(o => `${o.name}: ${o.count} deals, ${fmtEur(o.eur)}`).join('; ');
    const s = metrics.summary;

    const summary =
        `Pipeline: ${s.activeCount} active opportunities worth ${fmtEur(s.totalPipelineEur)} EUR. ` +
        `Won: ${s.wonCount} (${fmtEur(s.wonEur)}). Lost: ${s.lostCount}. Win rate: ${s.winRate}%. ` +
        `Avg probability: ${s.avgProbability}%. ` +
        `Stale (>90d no change): ${metrics.alerts.staleDeals.length}. ` +
        `At-risk (high value, low prob): ${metrics.alerts.atRisk.length}. ` +
        `Missing summaries: ${metrics.alerts.dataQuality.noSummaryCount}. ` +
        `By segment — ${segLines}. Top orgs — ${orgLines}.`;

    const system = 'You are a senior sales intelligence analyst for Trelleborg Sealing Solutions (TSS). ' +
        'Generate a concise executive snapshot from the pipeline metrics provided. ' +
        'Return ONLY raw valid JSON. Do NOT wrap in markdown. Do NOT use ``` or ```json. Start your response with { and end with }. ' +
        'Structure: {"headline":"one powerful sentence","narrative":["2-3 sentence para 1","2-3 sentence para 2"],' +
        '"keyInsights":["insight 1","insight 2","insight 3"],' +
        '"topAlert":"single most important risk or action needed right now"}. ' +
        'Use real numbers. Be sharp and specific. No hallucination.' +
        businessContext;

    const raw = await callClaude(system, 'Pipeline metrics: ' + summary, apiKey);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);
}

// ─── Main compute function ────────────────────────────────────────────────────

async function compute(cds, businessContext, apiKey) {
    _status = 'computing';
    console.log('[PreAssessment] Starting computation...');
    const t0 = Date.now();

    try {
        // 1. Fetch all opportunities
        const c4c = await cds.connect.to('c4c');
        const OPP_SEL = 'ObjectID,ID,Name,SalesOrganisationID,SalesOrganisationName,' +
            'SalesCyclePhaseCode,SalesCyclePhaseCodeText,ExpectedRevenueAmount,ExpectedRevenueAmountCurrencyCode,' +
            'ExpectedProcessingEndDate,LifeCycleStatusCode,LifeCycleStatusCodeText,' +
            'ResultReasonCode,ResultReasonCodeText,ProbabilityPercent,' +
            'ProspectPartyID,ProspectPartyName,MainEmployeeResponsiblePartyName,CreationDate,LastChangeDate,' +
            'OpportunityLevel_KUT,OpportunityLevel_KUTText,BUS_SEG_CDE_KUT,BUS_SEG_CDE_KUTText,' +
            'CustomerABCClassificationCode_PSM,CustomerABCClassificationCode_PSMText,' +
            'MKT_SEG_CODE,MKT_SEG_CODEText,MKT_SEG_GRP_CDE_KUT,MKT_SEG_GRP_CDE_KUTText,' +
            'ZHasCompetitor_KUT,ZHasSummary_KUT,ZHasSupplier_KUT,' +
            'ZBaseCurrency_KUTContent_KUT,ZBaseCurrency_KUTcurrencyCode_KUT,' +
            'ZConfidential_SDK,CONGLOCODE_KUT,Channel_KUT,Channel_KUTText,' +
            'ProcessingTypeCode,ProcessingTypeCodeText,PrimaryContactPartyName';

        let all = [], path = "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=1000&$select=" + OPP_SEL, page = 0;
        while (path && page < 20) {
            const result = await c4c.send({ method: 'GET', path });
            const records = Array.isArray(result) ? result : (result.value || result);
            if (!records || records.length === 0) break;
            all = all.concat(records);
            page++;
            const nextLink = result['@odata.nextLink'] || result['odata.nextLink'];
            path = (nextLink && records.length >= 1000)
                ? "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=1000&$select=" + OPP_SEL + '&$skip=' + all.length
                : null;
        }
        console.log('[PreAssessment] Fetched ' + all.length + ' opportunities in ' + page + ' pages');

        // 2. Compute metrics in JS
        const metrics = computeMetrics(all);
        const opportunitySummary = computeSummary(all);

        // 3. Run AI once on the small summary
        let aiNarrative = null;
        try {
            aiNarrative = await runAINarrative(metrics, businessContext, apiKey);
        } catch (aiErr) {
            console.warn('[PreAssessment] AI narrative failed (non-fatal):', aiErr.message);
            aiNarrative = {
                headline: 'Pipeline snapshot computed — AI narrative temporarily unavailable.',
                narrative: ['Metrics computed from live C4C data.'],
                keyInsights: [],
                topAlert: null
            };
        }

        _cache = {
            metrics,
            aiNarrative,
            opportunitySummary,
            rawOpportunities: all,
            recordCount: all.length,
            computedAt: new Date().toISOString(),
            computeDurationMs: Date.now() - t0
        };
        _lastComputed = new Date();
        _status = 'ready';
        _error = null;
        console.log('[PreAssessment] Done in ' + (Date.now() - t0) + 'ms');
    } catch (err) {
        _status = 'error';
        _error = err.message;
        console.error('[PreAssessment] Failed:', err.message);
    }
}

// ─── Bootstrap — called once from ai-service.js ──────────────────────────────

function start(cds, businessContext, apiKey) {
    // First run — delay 5s to let CAP fully boot
    setTimeout(() => compute(cds, businessContext, apiKey), 5000);
    // Refresh every 6 hours
    setInterval(() => compute(cds, businessContext, apiKey), REFRESH_INTERVAL_MS);
}

module.exports = { start, getCache };
