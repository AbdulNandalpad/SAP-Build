const cds = require('@sap/cds');
const preAssessment = require('./lib/pre-assessment');

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
        // Serve from pre-assessment cache — no live C4C fetch in request path
        const { cache, status } = preAssessment.getCache();
        if (cache && cache.salesQuotes && cache.salesQuotes.length > 0) {
            console.log('[CAP] SalesQuotes: serving ' + cache.salesQuotes.length + ' from cache');
            return cache.salesQuotes;
        }
        // Cache not ready — return empty with status hint
        console.log('[CAP] SalesQuotes: cache not ready (status=' + status + ')');
        req.error(503, 'Pipeline data is loading. Please refresh in 30 seconds.');
    });

    this.on('getQuoteOpportunityLink', async (req) => {
        const { objectID } = req.data;
        return await fetchQuoteOpportunityLink(c4c, objectID);
    });
});
