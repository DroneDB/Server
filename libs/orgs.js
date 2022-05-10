const express = require('express');
const router = express.Router();
const Mode = require('./Mode');
const Consts = require('./Consts');

router.get('/orgs/:org?', async (req, res) => {
    if (Mode.singleDB){
        // Single org (default)
        const publicOrg = {
            slug: "projects",
            name: "Projects",
            description: "",
            creationDate: Consts.startupTime.toISOString(),
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
        res.json([{TODO: true}]);
    }
});


module.exports = {
    api: router
}
