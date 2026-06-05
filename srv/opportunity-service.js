const cds = require('@sap/cds')

module.exports = cds.service.impl(async function () {
    const c4c = await cds.connect.to('c4c')

    this.on('READ', 'Opportunities', async (req) => {
        return c4c.run(req.query)
    })
})
