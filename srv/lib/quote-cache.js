/**
 * Standalone background cache for SalesQuoteCollection.
 * Runs independently of pre-assessment so failures don't affect opportunity data.
 */

const REFRESH_MS = 6 * 60 * 60 * 1000;

// Minimal field set — only include fields confirmed to exist in C4C
const QUOTE_SEL = [
    'ObjectID', 'ID', 'Name',
    'BuyerPartyID', 'BuyerPartyName',
    'SalesOrganisationID', 'SalesOrganisationName',
    'EmployeeResponsiblePartyID', 'EmployeeResponsiblePartyName',
    'SalesTerritoryID', 'SalesTerritoryName',
    'LifeCycleStatusCode', 'LifeCycleStatusCodeText',
    'ResultStatusCode', 'ResultStatusCodeText',
    'ProcessingTypeCode', 'ProcessingTypeCodeText',
    'NetAmount', 'NetAmountCurrencyCode', 'GrossAmount', 'CurrencyCode',
    'CreationDateTime', 'LastChangeDateTime',
    'ValidFromDate', 'ValidToDate',
    'ProbabilityPercent',
    'BUS_SEG_CDE_KUT', 'BUS_SEG_CDE_KUTText',
    'MKT_SEG_CODE_KUT', 'MKT_SEG_CODE_KUTText',
    'VersionGroupID', 'VersionID',
    'ZConfidntial_SDK', 'ZBIZTYPEText',
    'ZOutDate_SDK', 'ZInqDate_SDK'
].join(',');

let _quotes = null;
let _status = 'pending';
let _computedAt = null;
let _error = null;

function getCache() {
    return { quotes: _quotes, status: _status, computedAt: _computedAt, error: _error };
}

async function fetch24mQuotes(c4c) {
    const since = new Date();
    since.setMonth(since.getMonth() - 24);
    const sinceStr = since.toISOString().replace(/\.\d{3}Z$/, '');
    const path = `SalesQuoteCollection?$filter=CreationDateTime ge datetime'${sinceStr}'&$top=500&$select=${QUOTE_SEL}`;
    console.log('[QuoteCache] Fetching:', path.substring(0, 120));
    const result = await c4c.send({ method: 'GET', path });
    return Array.isArray(result) ? result : (result.value || result || []);
}

async function compute(cds) {
    _status = 'computing';
    console.log('[QuoteCache] Starting fetch...');
    try {
        const c4c = await cds.connect.to('c4c');
        const quotes = await fetch24mQuotes(c4c);
        _quotes = quotes;
        _status = 'ready';
        _computedAt = new Date().toISOString();
        _error = null;
        console.log('[QuoteCache] Done: ' + quotes.length + ' quotes cached');
    } catch (err) {
        _status = 'error';
        _error = err.message;
        console.error('[QuoteCache] Failed:', err.message, err.code || '', JSON.stringify(err).substring(0, 400));
    }
}

function start(cds) {
    setTimeout(() => compute(cds), 10000); // 10s after boot (after pre-assessment starts)
    setInterval(() => compute(cds), REFRESH_MS);
}

module.exports = { start, getCache };
