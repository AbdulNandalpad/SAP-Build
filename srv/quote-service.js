const cds = require('@sap/cds');

const QUOTE_SEL = [
    "ObjectID,ID,Name",
    "BuyerPartyID,BuyerPartyName,BuyerContactPartyID,BuyerContactPartyName",
    "SalesOrganisationID,EmployeeResponsiblePartyID,EmployeeResponsiblePartyName",
    "SalesTerritoryID,SalesTerritoryName",
    "LifeCycleStatusCode,LifeCycleStatusCodeText",
    "ResultStatusCode,ResultStatusCodeText",
    "ApprovalStatusCode,ApprovalStatusCodeText",
    "ProcessingTypeCode,ProcessingTypeCodeText",
    "NetAmount,NetAmountCurrencyCode,GrossAmount,CurrencyCode",
    "DateTime,CreationDateTime,LastChangeDateTime",
    "ValidFromDate,ValidToDate,RequestedFulfillmentStartDateTime",
    "ProbabilityPercent,MainDiscount",
    "IncotermsClassificationCode,IncotermsClassificationCodeText",
    "VersionGroupID,VersionID",
    "BUS_SEG_CDE_KUT,BUS_SEG_CDE_KUTText",
    "MKT_SEG_CODE_KUT,MKT_SEG_CODE_KUTText",
    "OrderProbability_KUT,OrderProbability_KUTText",
    "ZConfidntial_SDK,ZBIZTYPEText",
    "ZOutDate_SDK,ZInqDate_SDK,ZSubmitDate_SDK",
    "INQUIRYDATE,Inquiry",
    "ZQuoteLayout_KUT,ZQuoteLayout_KUTText"
].join(',');

async function fetchAllQuotes(c4c) {
    let all = [], skip = 0, page = 0;
    while (page < 20) {
        const path = `SalesQuoteCollection?$top=1000&$skip=${skip}&$select=${QUOTE_SEL}`;
        const result = await c4c.send({ method: 'GET', path });
        const records = Array.isArray(result) ? result : (result.value || result);
        if (!records || records.length === 0) break;
        all = all.concat(records);
        skip += records.length;
        page++;
        if (records.length < 1000) break;
    }
    console.log('[CAP] SalesQuotes: ' + all.length + ' records in ' + page + ' pages');

    // Enrich with opportunity links via SalesQuoteReference nav property (sample fetch)
    // Full expand would be: $expand=SalesQuoteReference but can be slow for large sets
    // We tag VersionGroupID as the version-family key instead
    return all;
}

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
        try {
            const top = req.query.SELECT && req.query.SELECT.limit && req.query.SELECT.limit.rows && req.query.SELECT.limit.rows.val;
            const probe = await c4c.send({ method: 'GET', path: 'SalesQuoteCollection?$top=1&$select=ObjectID,ID,Name' });
            console.log('[CAP] SalesQuoteCollection probe OK, records:', JSON.stringify(probe).substring(0, 200));
            if (top && top <= 100) {
                const result = await c4c.send({ method: 'GET', path: `SalesQuoteCollection?$top=${top}&$select=${QUOTE_SEL}` });
                return Array.isArray(result) ? result : (result.value || result);
            }
            return await fetchAllQuotes(c4c);
        } catch(e) {
            console.error('[CAP] SalesQuoteCollection ERROR:', e.message, e.code, JSON.stringify(e).substring(0, 500));
            throw e;
        }
    });

    this.on('getQuoteOpportunityLink', async (req) => {
        const { objectID } = req.data;
        const oppID = await fetchQuoteOpportunityLink(c4c, objectID);
        return oppID;
    });
});
