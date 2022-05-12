const express = require('express');
const router = express.Router();
const Mode = require('./Mode');
const { fsCreationDate, fsReaddir } = require('./fs');
const { orgInfoFromPath } = require('./org');
const Directories = require('./Directories');
const path = require('path');

router.get('/orgs/:org?', async (req, res) => {
    if (Mode.singleDB){
        // Single org (default)
        const publicOrg = {
            slug: "projects",
            name: "Projects",
            description: "",
            creationDate: await fsCreationDate(Directories.singleDBPath).toISOString(),
            owner: null,
            isPublic: true
        };
        const orgs = [publicOrg];

        if (req.params.org === undefined) res.json(orgs);
        else{
            const org = orgs.find(o => o.slug === req.params.org);
            
            if (org) res.json(org);
            else res.status(404).json({error: "Organization not found"});
        }
    }else{
        const { org } = req.params;
        const orgs = [];

        const entries = await fsReaddir(Directories.storagePath, { withFileTypes: true });
        for (let i = 0; i < entries.length; i++){
            const e = entries[i];
            if (!e.isDirectory() || e.name.startsWith(".")) continue;
            if (org !== undefined && org !== e.name) continue;

            const orgInfo = await orgInfoFromPath(path.join(Directories.storagePath, e.name));
            orgs.push({
                slug: e.name,
                name: orgInfo.name,
                description: orgInfo.description,
                creationDate: orgInfo.creationDate,
                owner: orgInfo.owner !== null ? orgInfo.owner : e.name,
                isPublic: orgInfo.isPublic
            });
        }

        if (org && orgs.length === 1) res.json(orgs[0]);
        else res.json(orgs);
    }
});


module.exports = {
    api: router
}
