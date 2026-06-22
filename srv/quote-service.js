const cds = require('@sap/cds');
const quoteCache = require('./lib/quote-cache');

// Fetch opportunity link for a specific quote by expanding SalesQuoteReference
async function fetchQuoteOpportunityLink(c4c, objectID) {
    try {
        const path = `SalesQuoteCollection('${objectID}')/SalesQuoteReference?$select=BusinessDocumentTypeCode,BusinessDocumentID`;
        const result = await c4c.send({ method: 'GET', path });
        const refs = Array.isArray(result) ? result : (result.value || result || []);
        const oppRef = refs.find(r => r.BusinessDocumentTypeCode === 'OPPT');
        return oppRef ? oppRef.BusinessDocumentID : null;
    } catch (e) {
        return null;
    }
}

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c');

    this.on('READ', 'SalesQuotes', async (req) => {
        const { quotes, status } = quoteCache.getCache();
        // Return data if ready or errored (error = fetch failed, return empty rather than 503 loop)
        if (status === 'ready' || status === 'error' || quotes !== null) {
            console.log('[CAP] SalesQuotes: serving ' + (quotes||[]).length + ' (status=' + status + ')');
            return quotes || [];
        }
        console.log('[CAP] SalesQuotes: cache pending (status=' + status + ')');
        req.error(503, 'Quote data is loading. Please refresh in 30 seconds.');
    });

    this.on('getQuoteOpportunityLink', async (req) => {
        const { objectID } = req.data;
        return await fetchQuoteOpportunityLink(c4c, objectID);
    });
});
