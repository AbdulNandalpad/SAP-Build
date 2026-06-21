const cds = require('@sap/cds');

const OPP_SEL = "ObjectID,ID,Name,SalesOrganisationID,SalesOrganisationName,SalesCyclePhaseCode,SalesCyclePhaseCodeText,SalesCyclePhaseStartDate,ExpectedRevenueAmount,ExpectedRevenueAmountCurrencyCode,ExpectedProcessingEndDate,LifeCycleStatusCode,LifeCycleStatusCodeText,ResultReasonCode,ResultReasonCodeText,ProbabilityPercent,ProspectPartyID,ProspectPartyName,MainEmployeeResponsiblePartyName,CreationDate,LastChangeDate,ProcessingTypeCode,ProcessingTypeCodeText,OpportunityLevel_KUT,OpportunityLevel_KUTText,BUS_SEG_CDE_KUT,BUS_SEG_CDE_KUTText,CustomerABCClassificationCode_PSM,CustomerABCClassificationCode_PSMText,ZHasCompetitor_KUT,ZHasSummary_KUT,ZHasSupplier_KUT,ZBaseCurrency_KUTContent_KUT,ZBaseCurrency_KUTcurrencyCode_KUT,ZConfidential_SDK,PrimaryContactPartyName,CONGLOCODE_KUT,Channel_KUT,Channel_KUTText,MKT_SEG_CODE,MKT_SEG_CODEText,MKT_SEG_GRP_CDE_KUT,MKT_SEG_GRP_CDE_KUTText";

// Rolling 18-month window — keeps memory bounded as data grows
function dateFilter18m() {
    const d = new Date();
    d.setMonth(d.getMonth() - 18);
    return d.toISOString().substring(0, 10) + 'T00:00:00';
}

async function fetchOpportunities(c4c, { top = 200, orgID, busSeg, statusCode } = {}) {
    const filters = [`CreationDate ge datetime'${dateFilter18m()}'`];
    if (orgID)      filters.push(`SalesOrganisationID eq '${orgID}'`);
    if (busSeg)     filters.push(`BUS_SEG_CDE_KUT eq '${busSeg}'`);
    if (statusCode) filters.push(`LifeCycleStatusCode eq '${statusCode}'`);

    const filter = filters.join(' and ');
    const path = `OpportunityCollection?$filter=${encodeURIComponent(filter)}&$top=${Math.min(top, 500)}&$select=${OPP_SEL}`;
    const result = await c4c.send({ method: 'GET', path });
    const records = Array.isArray(result) ? result : (result.value || result);
    console.log('[CAP] Opportunities: ' + records.length + ' records');
    return records;
}

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c');

    this.on('READ', 'Opportunities', async (req) => {
        const top = req.query.SELECT?.limit?.rows?.val || 200;
        return fetchOpportunities(c4c, { top });
    });
});
