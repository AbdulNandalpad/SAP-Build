const cds = require('@sap/cds');
const preAssessment = require('./lib/pre-assessment');
const { parseDate, computeSummary } = require('./lib/opp-summary');

module.exports = cds.service.impl(async function () {

    this.on('getSummary', async (req) => {
        const { cache, status } = preAssessment.getCache();
        if (cache && cache.opportunitySummary) {
            return JSON.stringify(cache.opportunitySummary);
        }
        // Cache not ready yet — return status so UI can show a loading state
        return JSON.stringify({ status: status || 'computing', message: 'Pipeline data is being computed. Please retry in a few seconds.' });
    });

});
