const express = require('express');
const router = express.Router();
const Mode = require('./Mode');
const { fsCreationDate, fsExists, fsMkdir, fsMove, fsRm } = require('./fs');
const Directories = require('./Directories');
const path = require('path');
const { asyncHandle } = require('./middleware');
const { allowLoggedIn, allowAnonymous } = require('./security');
const { formDataParser } = require('./parsers');
const db = require('./db');
const { safePathJoin } = require('./pathsec');
const ddb = require('../vendor/ddb');
const { addOrg, getOrg, orgToJson, getOrgOwner, getOrgById } = require('./org');

const getUserOrgs = function(req, res, next){
    if (req.user !== undefined){
        req.orgs = db.fetchMultiple(`SELECT o.*
                    FROM users u, orgs o
                    INNER JOIN user_orgs uo ON u.id = uo.user_id AND o.id = uo.org_id
                    WHERE u.username = ? OR o.isPublic = 1`, req.user.username);
    }else{
        req.orgs = db.fetchMultiple(`SELECT o.* FROM orgs o WHERE o.isPublic = 1`);
    }
    next();
}

const isOrgOwner = [allowLoggedIn, function(req, res, next){
    const { org } = req.params;
    if (getOrgOwner(org) !== req.user.username) res.status(401).json({error: "Unauthorized"});
    else next();
}];

const checkOrgNotExists = async (slug) => {
    if (!slug) throw new Error("Invalid slug");
    const orgPath = safePathJoin(Directories.storagePath, slug);

    if (await fsExists(orgPath)) throw new Error("Organization already exists on filesystem");
    const r = db.prepare("SELECT id FROM orgs WHERE slug = ?").get(slug);
    if (r) throw new Error("Organization already exists in DB");
};

const checkOrgExists = async (slug) => {
    if (!slug) throw new Error("Invalid slug");
    const orgPath = safePathJoin(Directories.storagePath, slug);

    if (!await fsExists(orgPath)) throw new Error("Organization does not exists on filesystem");
    const r = db.prepare("SELECT id FROM orgs WHERE slug = ?").get(slug);
    if (!r) throw new Error("Organization does not exists in DB");
};

router.get('/orgs/:org?', allowAnonymous, allowLoggedIn, getUserOrgs, asyncHandle(async (req, res) => {
    if (Mode.singleDB){
        // Single org (default)
        const publicOrg = {
            slug: "projects",
            name: "Projects",
            description: "",
            creationDate: (await fsCreationDate(Directories.singleDBPath)).toISOString(),
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

        for (let i = 0; i < req.orgs.length; i++){
            if (org && req.orgs[i].slug !== org) continue;

            orgs.push(orgToJson(req.orgs[i]));
        }

        if (org && orgs.length === 1) res.json(orgs[0]);
        else res.json(orgs);
    }
}));

router.post('/orgs', allowLoggedIn, formDataParser, getUserOrgs, asyncHandle(async (req, res) => {
    if (Mode.singleDB) throw new Error("Cannot create new orgs in singleDB mode");
    
    let { slug, name, description, isPublic } = req.body;
    if (!ddb.Tag.validComponent(slug)) throw new Error("Invalid slug");
    isPublic = Boolean(isPublic);
    const orgPath = safePathJoin(Directories.storagePath, slug);

    await checkOrgNotExists(slug);
    
    // Create
    const id = addOrg({
        slug,
        name,
        description,
        isPublic
    }, req.user.username);

    await fsMkdir(orgPath, { recursive: true });

    res.json(orgToJson(getOrgById(id)));
}));

router.put('/orgs/:org', isOrgOwner, formDataParser, asyncHandle(async (req, res) => {
    let { slug, name, description, isPublic } = req.body;

    if (!ddb.Tag.validComponent(slug)) throw new Error("Invalid slug");
    isPublic = Boolean(isPublic);

    await checkOrgExists(req.params.org);
    
    const newOrgPath = safePathJoin(Directories.storagePath, slug);
    const prevOrgPath = safePathJoin(Directories.storagePath, req.params.org);
    
    // Update 
    if (newOrgPath !== prevOrgPath){
        await checkOrgNotExists(slug);

        // Rename
        await fsMove(prevOrgPath, newOrgPath);
        db.exec(`UPDATE orgs SET slug = ? WHERE slug = ?`, slug, req.params.org);
    }

    if (name !== undefined) db.prepare(`UPDATE orgs SET name = ? WHERE slug = ?`).run(name, slug);
    if (description !== undefined) db.prepare(`UPDATE orgs SET description = ? WHERE slug = ?`).run(description, slug);
    db.prepare(`UPDATE orgs SET isPublic = ? WHERE slug = ?`).run(isPublic ? 1 : 0, slug);

    res.json(orgToJson(getOrg(slug)));
}));

router.delete('/orgs/:org', isOrgOwner, asyncHandle(async (req, res) => {
    const { org } = req.params;
    await checkOrgExists(org);
    
    db.prepare(`DELETE FROM orgs WHERE slug = ?`).run(org);

    // Remove from file system
    const orgPath = safePathJoin(Directories.storagePath, org);
    await fsRm(orgPath, { recursive: true});

    res.status(204).send("");
}));

module.exports = {
    api: router
}
