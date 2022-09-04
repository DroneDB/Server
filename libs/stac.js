const security = require('./security');
const express = require('express');
const router = express.Router();
const { asyncHandle } = require('./middleware');
const ddb = require('../vendor/ddb');

const stacRootFromReq = (req) => {
    return `${req.secure ? "https" : "http"}://${req.headers.host}/orgs/${req.params.org}/ds/${req.params.ds}`;
};

router.get('/orgs/:org/ds/:ds/stac', security.allowDatasetRead, asyncHandle(async (req, res) => {
    let entry = req.query.path !== undefined ? req.query.path : "";
    
    const stac = await ddb.stac(req.ddbPath, { 
        stacRoot: stacRootFromReq(req), 
        entry,
        id: `${req.params.org}/${req.params.ds}`
    });

    res.json(stac);
}));

module.exports = {
    api: router
}