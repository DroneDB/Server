const path = require('path');
const Directories = require('./Directories');
const ddb = require('../vendor/ddb');
const express = require('express');
const router = express.Router();
const { allowOrgWrite, allowDatasetWrite } = require('./security');
const { formDataParser, uploadParser } = require('./parsers');
const { asyncHandle, allowNewDDBPath, assignUUID } = require('./middleware');
const { fsMkdir, fsExists, fsWriteFile, fsMove, fsReadFile, fsRm, } = require('./fs');
const { checkAllowedPath } = require('./ds_security');
const Mode = require('./Mode');

router.post('/orgs/:org/ds/:ds/push/init', allowNewDDBPath, allowOrgWrite, assignUUID, formDataParser, asyncHandle(async (req, res) => {
    let validateChecksum = false;

    // We cannot create new datasets in singleDB mode
    if (!(await fsExists(req.ddbPath))){
        if (Mode.singleDB) {
            throw new Error("Cannot push to new dataset");
        }else{
            await fsMkdir(req.ddbPath, { recursive: true });
            await ddb.init(req.ddbPath);
        }
    }else{
        // Ds exists
        validateChecksum = true;
    }

    let ourStamp = null;
    if (validateChecksum){
        if (!req.body.checksum) throw new Error("Checksum missing");
        ourStamp = await ddb.getStamp(req.ddbPath);
        if (req.body.checksum != ourStamp.checksum){
            res.json({pullRequired: true});
            return;
        }
    }

    if (!ourStamp) ourStamp = await ddb.getStamp(req.ddbPath);
    if (!req.body.stamp) throw new Error("Missing stamp");

    let delta = await ddb.delta(JSON.parse(req.body.stamp), ourStamp);
    let locals = await ddb.computeDeltaLocals(req.ddbPath, delta);
    const tmpPath = path.join(Directories.tmp, req.id);
    await fsMkdir(tmpPath, { recursive: true });

    await fsWriteFile(path.join(tmpPath, "stamp.json"), req.body.stamp);
    await fsWriteFile(path.join(tmpPath, "our_stamp.json"), JSON.stringify(ourStamp));
    
    res.json({
        token: req.id,
        neededFiles: delta.adds.filter(i => i.hash && !locals[i.hash]).map(i => i.path),
        neededMeta: delta.metaAdds,
        pullRequired: false
    });
}));

const getToken = asyncHandle(async (req, res, next) => {
    const { token } = req.body;
    const tmpPath = path.join(Directories.tmp, token);
    if (!(await fsExists(tmpPath))) throw new Error("Invalid token");

    req.tmpPath = tmpPath;
    req.token = req.body.token;
    next();
});

router.post('/orgs/:org/ds/:ds/push/meta', allowDatasetWrite, formDataParser, getToken, asyncHandle(async (req, res) => {
    const { meta } = req.body;
    if (meta === undefined) throw new Error("Missing meta");

    // Validate JSON
    JSON.parse(req.body.meta);

    // Write to file
    await fsWriteFile(path.join(req.tmpPath, "meta.json"), req.body.meta);

    res.status(200).send("");
}));

router.post('/orgs/:org/ds/:ds/push/upload', allowDatasetWrite, uploadParser("file", { required: true, formData: true }), getToken, asyncHandle(async (req, res) => {
    const inputPath = req.body.path;
    if (inputPath === undefined) throw new Error("Missing path");

    checkAllowedPath(req.ddbPath, inputPath);

    const destPath = path.join(req.tmpPath, "adds");
    await fsMkdir(destPath, { recursive: true});

    const filePath = path.join(destPath, inputPath);
    await fsMkdir(path.dirname(filePath), { recursive: true });
    
    await fsMove(req.filePath, filePath);

    res.status(200).send("");
}));

router.post('/orgs/:org/ds/:ds/push/commit', allowDatasetWrite, formDataParser, getToken, asyncHandle(async (req, res) => {
    let stampFile = path.join(req.tmpPath, "stamp.json");
    let ourStampFile = path.join(req.tmpPath, "our_stamp.json");
    let metaFile = path.join(req.tmpPath, "meta.json");
    let addsFolder = path.join(req.tmpPath, "adds");

    [stampFile, ourStampFile].forEach(async f => {
        if (!await fsExists(f)) throw new Error(`${f} not found`);
    });

    let stamp = JSON.parse(await fsReadFile(stampFile));
    let ourStamp = JSON.parse(await fsReadFile(ourStampFile));
    
    // Check that our stamp has not changed! If it has, another client
    // might have performed changes that could conflict with our operation
    // TODO: we could check for conflicts rather than failing and continue
    // the operation if no conflicts are detected.
    let currentStamp = await ddb.getStamp(req.ddbPath);
    if (currentStamp.checksum !== ourStamp.checksum) throw new Error("The dataset has been changed by another user while pushing. Please try again!");

    let delta = await ddb.delta(stamp, currentStamp);
    await ddb.computeDeltaLocals(req.ddbPath, delta, addsFolder);

    // Check if all files are uploaded
    delta.adds.forEach(async i => {
        if (i.hash && !(await fsExists(path.join(addsFolder, i.path)))) throw new Error(`Cannot commit: missing '${i.path}'`);
    });

    let metaDump = null;
    if (await fsExists(metaFile)) metaDump = JSON.parse(await fsReadFile(metaFile));
    
    let conflicts = await ddb.applyDelta(delta, addsFolder, req.ddbPath, metaDump, { mergeStrategy: ddb.MergeStrategy.KeepTheirs});
    if (conflicts.length) throw new Error("Merge conflicts detected, try pulling first.");

    await fsRm(req.tmpPath, { recursive: true });

    ddb.build(req.ddbPath);

    res.status(200).send("");
}));

module.exports = {
    api: router
};
