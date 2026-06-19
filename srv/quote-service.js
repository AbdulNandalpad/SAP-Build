const cds = require('@sap/cds');

const QUOTE_SEL = "ObjectID,ID,Name,BuyerPartyID,BuyerPartyName,SalesOrganisationID,SalesOrganisationName,MainEmployeeResponsiblePartyID,MainEmployeeResponsiblePartyName,LifeCycleStatusCode,LifeCycleStatusCodeText,ProcessingTypeCode,ProcessingTypeCodeText,TotalNetAmount,TotalGrossAmount,CurrencyCode,CreationDateTime,LastChangeDateTime,ExpirationDate,RequestedFulfillmentPeriodStartDate,SalesCyclePhaseCode,SalesCyclePhaseCodeText,ProbabilityPercent,ResultReasonCode,ResultReasonCodeText,OpportunityID";

async function fetchAllQuotes(c4c) {
    let all = [], path = 'SalesQuoteCollection?$top=1000&$select=' + QUOTE_SEL, page = 0;
    while (path && page < 20) {
        const result = await c4c.send({ method: 'GET', path });
        const records = Array.isArray(result) ? result : (result.value || result);
        if (!records || records.length === 0) break;
        all = all.concat(records);
        page++;
        const nextLink = result['@odata.nextLink'] || result['odata.nextLink'];
        path = (nextLink && records.length >= 1000) ? 'SalesQuoteCollection?$top=1000&$select=' + QUOTE_SEL + '&\$skip=' + all.length : null;
    }
    console.log('[CAP] SalesQuotes: ' + all.length + ' records in ' + page + ' pages');
    return all;
}

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c');

    this.on('READ', 'SalesQuotes', async (req) => {
        try {
            const top = req.query.SELECT && req.query.SELECT.limit && req.query.SELECT.limit.rows && req.query.SELECT.limit.rows.val;
            const probe = await c4c.send({ method: 'GET', path: 'SalesQuoteCollection?$top=1&$select=ObjectID,ID,Name' });
            console.log('[CAP] SalesQuoteCollection probe OK, records:', JSON.stringify(probe).substring(0, 200));
            if (top && top <= 100) {
                const result = await c4c.send({ method: 'GET', path: 'SalesQuoteCollection?$top=' + top + '&$select=' + QUOTE_SEL });
                return Array.isArray(result) ? result : (result.value || result);
            }
            return await fetchAllQuotes(c4c);
        } catch(e) {
            console.error('[CAP] SalesQuoteCollection ERROR:', e.message, e.code, JSON.stringify(e).substring(0, 500));
            throw e;
        }
    });
});
