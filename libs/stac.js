const security = require('./security');
const express = require('express');
const router = express.Router();
const { asyncHandle } = require('./middleware');
const ddb = require('../vendor/ddb');
const Mode = require('./Mode');
const { fsReaddir } = require('./fs');
const { storagePath } = require('../config');
const path = require("path");
const cors = require('cors');

const stacCollectionRootFromReq = (req) => {
    return `${req.secure ? "https" : "http"}://${req.headers.host}/orgs/${req.params.org}/ds/${req.params.ds}`;
};

const hostFromReq = (req) => {
    return `${req.secure ? "https" : "http"}://${req.headers.host}`;
};

const enumPublicDatasets = async () => {
    // TODO: improve performance by caching which datasets are public so 
    // we don't need to check each one individually


    const orgs = (await fsReaddir(storagePath, { withFileTypes: true })).filter(e => e.isDirectory() && !e.name.startsWith(".")).map(e => e.name);
    const datasets = [];

    for (let i = 0; i < orgs.length; i++){
        const org = orgs[i];
        const orgDir = path.join(storagePath, org);

        const folders = (await fsReaddir(orgDir, { withFileTypes: true })).filter(e => e.isDirectory() && !e.name.startsWith(".")).map(e => path.join(orgDir, e.name));

        const infos = await ddb.info(folders);
        infos.forEach(info => {
            if (info.type === ddb.entry.type.DRONEDB && info?.properties?.meta?.visibility?.data === ddb.Visibility.PUBLIC){
                const p = path.relative(storagePath, info.path.substring("file://".length));
                const [org, ds] = p.split('/');

                datasets.push({
                    org,
                    ds,
                    name: info?.properties?.meta?.name?.data ?? `org/ds`
                });
            }
        });
    }

    return datasets;
};

router.get('/orgs/:org/ds/:ds/stac/:path?', cors(), security.allowDatasetRead, asyncHandle(async (req, res) => {
    let entry = req.params.path !== undefined ? Buffer.from(req.params.path, 'base64').toString('utf8') : "";
    
    const stac = await ddb.stac(req.ddbPath, { 
        stacCollectionRoot: stacCollectionRootFromReq(req), 
        stacCatalogRoot: hostFromReq(req),
        entry,
        id: `${req.params.org}/${req.params.ds}`
    });

    //stac.links[0].href="http://localhost:5000/stac";

    res.json(stac);
}));

router.get('/stac', cors(), asyncHandle(async (req, res) => {
    let publicDatasets = [];

    if (Mode.singleDB){
        const info = await ddb.info(Directories.singleDBPath, { withHash: false, stoponError: true });
        const name = path.basename(info[0].path);
        
        publicDatasets.push({
            org: "public",
            ds: name,
            name
        });
    }else{
        // Find all datasets marked as public
        publicDatasets = await enumPublicDatasets();
    }

    const host = hostFromReq(req);
    const title = "DroneDB public datasets catalog";

    res.json({
        type: "Catalog",
        stac_version: "1.0.0",
        id: "DroneDB Catalog",
        description: title,
        // conformsTo : [
        //     "https://api.stacspec.org/v1.0.0-rc.1/core"
        // ],
        links: publicDatasets.map(ds => { return {
            href: `${host}/orgs/${ds.org}/ds/${ds.ds}/stac`,
            rel: 'child',
            title: ds.name
        }}).concat([
            {
                href: `${host}/stac`,
                rel: 'self',
                title
            },
            {
                href: `${host}/stac`,
                rel: 'root',
                title
            }//,
            // {
            //     "rel": "service-desc",
            //     "type": "application/vnd.oai.openapi+json;version=3.0",
            //     "href": `${host}/stac/api`
            // }
        ])
    });
}));

router.get('/stac/api', cors(), asyncHandle(async (req, res) => {
    res.json()
}));

module.exports = {
    api: router
}