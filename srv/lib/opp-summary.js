function parseDate(v) {
    if (!v) return null;
    const m = String(v).match(/\/Date\((\d+)\)\//);
    return m ? new Date(parseInt(m[1])) : new Date(v);
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

module.exports = { parseDate, computeSummary };
