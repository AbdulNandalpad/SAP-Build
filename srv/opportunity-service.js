const cds = require('@sap/cds');

const OPP_SEL = "ObjectID,ID,Name,SalesOrganisationID,SalesOrganisationName,SalesCyclePhaseCode,SalesCyclePhaseCodeText,SalesCyclePhaseStartDate,ExpectedRevenueAmount,ExpectedRevenueAmountCurrencyCode,ExpectedProcessingEndDate,LifeCycleStatusCode,LifeCycleStatusCodeText,ResultReasonCode,ResultReasonCodeText,ProbabilityPercent,ProspectPartyID,ProspectPartyName,MainEmployeeResponsiblePartyName,CreationDate,LastChangeDate,ProcessingTypeCode,ProcessingTypeCodeText,OpportunityLevel_KUT,OpportunityLevel_KUTText,BUS_SEG_CDE_KUT,BUS_SEG_CDE_KUTText,CustomerABCClassificationCode_PSM,CustomerABCClassificationCode_PSMText,ZHasCompetitor_KUT,ZHasSummary_KUT,ZHasSupplier_KUT";

async function fetchAllOpportunities(c4c, req) {
    let all = [], path = "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=1000&$select=" + OPP_SEL, page = 0;
    while (path && page < 20) {
        const result = await c4c.tx(req).send({ method: 'GET', path });
        const records = Array.isArray(result) ? result : (result.value || result);
        if (!records || records.length === 0) break;
        all = all.concat(records);
        page++;
        const nextLink = result['@odata.nextLink'] || result['odata.nextLink'];
        path = (nextLink && records.length >= 1000) ? "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=1000&$select=" + OPP_SEL + '&\$skip=' + all.length : null;
    }
    console.log('[CAP] Opportunities: ' + all.length + ' records in ' + page + ' pages');
    return all;
}

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c');

    this.on('READ', 'Opportunities', async (req) => {
        const top = req.query.SELECT && req.query.SELECT.limit && req.query.SELECT.limit.rows && req.query.SELECT.limit.rows.val;
        if (top && top <= 100) {
            const result = await c4c.tx(req).send({ method: 'GET', path: "OpportunityCollection?$filter=CreationDate ge datetime'2025-06-05T00:00:00'&$top=" + top + "&$select=" + OPP_SEL });
            return Array.isArray(result) ? result : (result.value || result);
        }
        return await fetchAllOpportunities(c4c, req);
    });
});
