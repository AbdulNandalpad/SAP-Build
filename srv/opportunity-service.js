const cds = require('@sap/cds');
const preAssessment = require('./lib/pre-assessment');

const OPP_SEL = "ObjectID,ID,Name,SalesOrganisationID,SalesOrganisationName,SalesCyclePhaseCode,SalesCyclePhaseCodeText,SalesCyclePhaseStartDate,ExpectedRevenueAmount,ExpectedRevenueAmountCurrencyCode,ExpectedProcessingEndDate,LifeCycleStatusCode,LifeCycleStatusCodeText,ResultReasonCode,ResultReasonCodeText,ProbabilityPercent,ProspectPartyID,ProspectPartyName,MainEmployeeResponsiblePartyName,CreationDate,LastChangeDate,ProcessingTypeCode,ProcessingTypeCodeText,OpportunityLevel_KUT,OpportunityLevel_KUTText,BUS_SEG_CDE_KUT,BUS_SEG_CDE_KUTText,CustomerABCClassificationCode_PSM,CustomerABCClassificationCode_PSMText,ZHasCompetitor_KUT,ZHasSummary_KUT,ZHasSupplier_KUT,ZBaseCurrency_KUTContent_KUT,ZBaseCurrency_KUTcurrencyCode_KUT,ZConfidential_SDK,PrimaryContactPartyName,CONGLOCODE_KUT,Channel_KUT,Channel_KUTText,MKT_SEG_CODE,MKT_SEG_CODEText,MKT_SEG_GRP_CDE_KUT,MKT_SEG_GRP_CDE_KUTText";

function parseDate(v) {
    if (!v) return null;
    const m = String(v).match(/\/Date\((\d+)\)\//);
    return m ? new Date(parseInt(m[1])) : new Date(v);
}

async function fetchAllOpportunities(c4c) {
    let all = [], skip = 0, page = 0;
    while (page < 30) {
        const path = `OpportunityCollection?$top=1000&$skip=${skip}&$select=${OPP_SEL}`;
        const result = await c4c.send({ method: 'GET', path });
        const records = Array.isArray(result) ? result : (result.value || result);
        if (!records || records.length === 0) break;
        all = all.concat(records);
        skip += records.length;
        page++;
        if (records.length < 1000) break;
    }
    console.log('[CAP] Opportunities: ' + all.length + ' total records in ' + page + ' pages');
    return all;
}

function computeSummary(all) {
    const isOpen = x => x.LifeCycleStatusCode === '1' || x.LifeCycleStatusCode === '2';
    const isWon  = x => x.LifeCycleStatusCode === '3';
    const isLost = x => x.LifeCycleStatusCode === '5';

    const open = all.filter(isOpen);
    const won  = all.filter(isWon);
    const lost = all.filter(isLost);

    const rev     = r => parseFloat(r.ExpectedRevenueAmount || 0);
    const eurRev  = r => parseFloat(r.ZBaseCurrency_KUTContent_KUT || r.ExpectedRevenueAmount || 0);
    const sum     = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const next12 = new Date(today); next12.setFullYear(next12.getFullYear() + 1);

    // --- By Sales Org ---
    const byOrg = {};
    all.forEach(x => {
        const k = x.SalesOrganisationID || '?';
        const label = (x.SalesOrganisationName || x.SalesOrganisationID || '?').replace(/^TSS\s*/i, '').substring(0, 30);
        if (!byOrg[k]) byOrg[k] = { id: k, name: label, count: 0, openRev: 0, wonCount: 0, lostCount: 0, openCount: 0 };
        byOrg[k].count++;
        if (isOpen(x)) { byOrg[k].openRev += eurRev(x); byOrg[k].openCount++; }
        if (isWon(x))  byOrg[k].wonCount++;
        if (isLost(x)) byOrg[k].lostCount++;
    });

    // --- By Business Segment ---
    const bySeg = {};
    all.forEach(x => {
        const k = x.BUS_SEG_CDE_KUTText || x.BUS_SEG_CDE_KUT || '(Not Set)';
        if (!bySeg[k]) bySeg[k] = { count: 0, openRev: 0, openCount: 0 };
        bySeg[k].count++;
        if (isOpen(x)) { bySeg[k].openRev += eurRev(x); bySeg[k].openCount++; }
    });

    // --- By Sales Phase ---
    const byPhase = {};
    all.forEach(x => {
        const k = x.SalesCyclePhaseCodeText || x.SalesCyclePhaseCode || '(Not Set)';
        if (!byPhase[k]) byPhase[k] = { count: 0, openRev: 0 };
        byPhase[k].count++;
        if (isOpen(x)) byPhase[k].openRev += eurRev(x);
    });

    // --- By Month (last 24 months created) ---
    const byMonth = {};
    all.forEach(x => {
        const d = parseDate(x.CreationDate);
        if (!d || isNaN(d)) return;
        const m = d.toISOString().substring(0, 7);
        byMonth[m] = (byMonth[m] || 0) + 1;
    });

    // --- By Owner (open pipeline) ---
    const byOwner = {};
    open.forEach(x => {
        const k = x.MainEmployeeResponsiblePartyName || '?';
        if (!byOwner[k]) byOwner[k] = { openRev: 0, count: 0 };
        byOwner[k].openRev += eurRev(x);
        byOwner[k].count++;
    });

    // --- Loss Reasons ---
    const byReason = {};
    lost.forEach(x => {
        const k = x.ResultReasonCodeText || 'No Reason';
        byReason[k] = (byReason[k] || 0) + 1;
    });

    // --- SOP by Year ---
    const sopByYear = {};
    open.forEach(x => {
        const d = parseDate(x.ExpectedProcessingEndDate);
        if (!d || isNaN(d) || d <= today) return;
        const yr = d.getFullYear();
        if (!sopByYear[yr]) sopByYear[yr] = { count: 0, rev: 0 };
        sopByYear[yr].count++;
        sopByYear[yr].rev += eurRev(x);
    });

    // --- Top open deals (for AI context, top 20 by revenue) ---
    const topDeals = open
        .slice().sort((a, b) => eurRev(b) - eurRev(a))
        .slice(0, 20)
        .map(x => ({
            id: x.ID,
            name: (x.Name || '').substring(0, 60),
            customer: x.ProspectPartyName || '',
            org: x.SalesOrganisationID || '',
            phase: x.SalesCyclePhaseCodeText || '',
            segment: x.BUS_SEG_CDE_KUTText || '',
            rev: Math.round(eurRev(x)),
            prob: parseFloat(x.ProbabilityPercent || 0),
            sop: x.ExpectedProcessingEndDate ? String(x.ExpectedProcessingEndDate).substring(0, 10) : null
        }));

    // --- Health indicators ---
    const stale90    = open.filter(x => { const d = parseDate(x.LastChangeDate); return !d || Math.floor((today - d) / 86400000) > 90; }).length;
    const zeroPct    = open.filter(x => !x.ProbabilityPercent || parseFloat(x.ProbabilityPercent) === 0).length;
    const noSummary  = open.filter(x => !x.ZHasSummary_KUT).length;
    const noSupplier = open.filter(x => !x.ZHasSupplier_KUT).length;
    const noComp     = open.filter(x => !x.ZHasCompetitor_KUT).length;
    const sopNext12  = sum(open.filter(x => { const d = parseDate(x.ExpectedProcessingEndDate); return d && d >= today && d <= next12; }), eurRev);

    // --- Market Segment ---
    const byMktSeg = {};
    open.forEach(x => {
        const k = x.MKT_SEG_CODEText || x.MKT_SEG_CODE || '(Not Set)';
        if (!byMktSeg[k]) byMktSeg[k] = { count: 0, openRev: 0 };
        byMktSeg[k].count++;
        byMktSeg[k].openRev += eurRev(x);
    });

    return {
        total: all.length,
        openCount: open.length,
        wonCount: won.length,
        lostCount: lost.length,
        totalRev: Math.round(sum(all, eurRev)),
        openRev: Math.round(sum(open, eurRev)),
        winRate: won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0,
        sopNext12Months: Math.round(sopNext12),
        health: { stale90, zeroPct, noSummary, noSupplier, noComp },
        byOrg:    Object.values(byOrg).sort((a, b) => b.openRev - a.openRev),
        bySeg:    Object.entries(bySeg).sort((a, b) => b[1].openRev - a[1].openRev).map(([k, v]) => ({ seg: k, ...v })),
        byMktSeg: Object.entries(byMktSeg).sort((a, b) => b[1].openRev - a[1].openRev).map(([k, v]) => ({ seg: k, ...v })),
        byPhase:  Object.entries(byPhase).sort((a, b) => b[1].openRev - a[1].openRev).map(([k, v]) => ({ phase: k, ...v })),
        byOwner:  Object.entries(byOwner).sort((a, b) => b[1].openRev - a[1].openRev).slice(0, 15).map(([k, v]) => ({ owner: k, ...v })),
        byReason: Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ reason: k, count: v })),
        byMonth:  Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([m, count]) => ({ month: m, count })),
        sopByYear: Object.entries(sopByYear).sort((a, b) => a[0].localeCompare(b[0])).map(([yr, v]) => ({ year: yr, ...v })),
        topDeals,
        generatedAt: new Date().toISOString()
    };
}

async function getCachedSummary(c4c) {
    // Use pre-assessment raw records (fetched in background — no gateway timeout risk)
    const { cache, status } = preAssessment.getCache();
    if (cache && cache.rawOpportunities && cache.rawOpportunities.length > 0) {
        console.log('[CAP] getSummary: using pre-assessment records (' + cache.rawOpportunities.length + ') from ' + cache.computedAt);
        return computeSummary(cache.rawOpportunities);
    }
    // Pre-assessment not ready yet — fetch directly (only happens in the first ~15s after boot)
    console.log('[CAP] getSummary: pre-assessment cache empty (status=' + status + '), fetching live...');
    const all = await fetchAllOpportunities(c4c);
    return computeSummary(all);
}

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c');

    // Lightweight READ — used only when UI needs raw rows (small $top requests)
    this.on('READ', 'Opportunities', async (req) => {
        const top = req.query.SELECT?.limit?.rows?.val || 50;
        const path = `OpportunityCollection?$top=${Math.min(top, 50)}&$select=${OPP_SEL}`;
        const result = await c4c.send({ method: 'GET', path });
        return Array.isArray(result) ? result : (result.value || result);
    });

    // Full aggregation — cached; first call fetches all records, subsequent calls return cache
    this.on('getSummary', async (req) => {
        const summary = await getCachedSummary(c4c);
        return JSON.stringify(summary);
    });

});
