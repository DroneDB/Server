const path = require('path');
const Directories = require('./Directories');
const tag = require('./tag');
const ddb = require('../vendor/ddb');
const { PUBLIC_ORG_NAME } = require('./tag');
const express = require('express');
const router = express.Router();
const { userAuth } = require('./jwt');
const { formDataParser, uploadParser } = require('./parsers');
const { assignUUID, asyncHandle } = require('./middleware');
const { fsRm, fsMkdir, fsWriteFile, fsExists, fsMove, fsReadFile } = require('./fs');

const getUUID = async (req, res, next) => {
    req.id = req.params.uuid;
    if (!req.id) throw new Error("Invalid UUID (not set)");

    const srcPath = path.join(Directories.tmp, req.id);
    const bodyFile = path.join(srcPath, "__body.json");

    if (!await fsExists(bodyFile)) throw new Error("Invalid UUID");
    
    next();
}

router.post('/share/init', userAuth, assignUUID, formDataParser, asyncHandle(async (req, res) => {
    const srcPath = path.join(Directories.tmp, req.id);
    const bodyFile = path.join(srcPath, "__body.json");

    const t = tag.parseOrCreateTag(req.body.tag, req.id);

    // Fill organization if missing
    if (t.organization.trim() === "" || t.organization === PUBLIC_ORG_NAME){
        t.organization = req.user.username;
    }
    
    // Check that we can create a dataset under the requested org
    if (t.organization !== req.user.username && t.organization !== tag.PUBLIC_ORG_NAME){
        res.status(401).json({error: `You're not authorized to upload to this organization.`});
        return;
    }

    try{
        await fsMkdir(srcPath, { recursive: true});

        // Update body tag
        req.body.tag = tag.dump(t);

        await fsWriteFile(bodyFile, JSON.stringify(req.body), {encoding: 'utf8'});
        await ddb.init(srcPath);

        // Set public
        await ddb.chattr(srcPath, { public: true });
        res.json({token: req.id});
    }catch(err){
        await fsRm(srcPath, { recursive: true });
        throw err;
    }
}));

router.post('/share/upload/:uuid', userAuth, asyncHandle(getUUID), uploadParser("file", { required: true, formData: true, 
    destPath: (req) => { 
        return path.join(Directories.tmp, req.id);
    },
    filePath: (req) => {
        if (typeof req.body.path === "string") return req.body.path;
        else throw new Error("Path missing");
    }}), asyncHandle(async (req, res) => {
        const ddbPath = path.join(Directories.tmp, req.id);

        const entries = await ddb.add(ddbPath, req.filePath);
        const e = entries.find(e => !ddb.entry.isDirectory(e));
        if (e){
            res.json({
                hash: e.hash,
                size: e.size,
                path: e.path
            });
        }else{
            throw new Error("Cannot add file (already added?)");
        }
}));
router.post('/share/commit/:uuid', userAuth, getUUID, asyncHandle(async (req, res) => {
    const srcPath = path.join(Directories.tmp, req.id);
    const bodyFile = path.join(srcPath, "__body.json");

    let body = {};

    const data = await fsReadFile(bodyFile, 'utf8');
    body = JSON.parse(data);
    await fsRm(bodyFile);

    const tagComp = tag.parseOrCreateTag(body.tag, req.id);
    const destDir = path.join(Directories.storagePath, tagComp.organization, tagComp.dataset)
    const orgDir = path.join(destDir, "..");
    if (!await fsExists(orgDir)){
        await fsMkdir(orgDir, { recursive: true });
        await ddb.init(orgDir);
    }

    await fsMove(srcPath, destDir);

    ddb.build(destDir);

    res.json({url: `/r/${tagComp.organization}/${tagComp.dataset}`, tag: tag.dump(tagComp)});
}));


module.exports = {
    api: router
};
