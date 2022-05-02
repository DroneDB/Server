const security = require('./security');
const Mode = require('./Mode');
const Consts = require('./Consts');
const tag = require('./tag');
const express = require('express');
const router = express.Router();
const ddb = require('../vendor/ddb');
const Directories = require('./Directories');
const path = require('path');

router.get('/orgs/:org/ds', security.allowOrgOwnerOrPublicOrgOnly, async (req, res) => {
    if (Mode.singleDB){
        // Single database
        const info = await ddb.info(Directories.singleDBPath, { withHash: false, stoponError: true });
        const name = path.basename(info[0].path);
        res.json([{
            slug: tag.filterComponentChars(name.length ? name : 'default'),
            creationDate: Consts.startupTime.toISOString(),
            size: info[0].size,
            properties: info[0].properties
        }]);
        return;
    }

    const { org } = req.params;
   
    const orgDir = path.join(Directories.storagePath, org);

    // Path traversal check
    if (orgDir.indexOf(Directories.storagePath) !== 0){
        cb(new Error("Invalid path"));
        return;
    }

    fs.exists(orgDir, exists => {
        if (exists){
            fs.readdir(orgDir, { withFileTypes: true }, (err, files) => {
                if (err) res.status(400).json({error: err.message});
                else{
                    res.json(files.filter(f => f.isDirectory()).map(f => {
                        return {
                            slug: f.name,
                            creationDate: new Date(fs.statSync(path.join(orgDir, f.name)).ctime.getTime()).toISOString()
                            // name: path.basename(f)
                            // TODO: more?
                        };
                    }));
                }
            });
        }else{
            res.json([]);
        }
    });
});

module.exports = {
    api: router
}