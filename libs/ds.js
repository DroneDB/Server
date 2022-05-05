const security = require('./security');
const Mode = require('./Mode');
const Consts = require('./Consts');
const tag = require('./tag');
const express = require('express');
const router = express.Router();
const ddb = require('../vendor/ddb');
const Directories = require('./Directories');
const path = require('path');
const { fsMove, fsMkdir } = require('./fs');
const { formDataParser, uploadParser } = require('./parsers');
const { getDDBPath, asyncHandle } = require('./middleware');
const { handleDownload, handleDownloadFile } = require('./download');

const formOrQueryParam = (req, param, defaultValue = "") => {
    if (req.query[param] !== undefined) return req.query[param];
    else if (req.body && req.body[param] !== undefined) return req.body[param];
    else return defaultValue;
};

const checkAllowedPath = (ddbPath, inputPath) => {
    security.pathTraversalCheck(ddbPath, inputPath);

    // Don't allow direct writes / reads to .ddb subfolders
    if (path.resolve(ddbPath, inputPath).indexOf(path.join(ddbPath, ".ddb")) === 0) throw new Error(`Invalid path: ${inputPath}`);
}

const ddbUrlFromReq = (req) => {
    return `${req.secure ? "ddb" : "ddb+unsafe"}://${req.headers.host}/${req.params.org}/${req.params.ds}`;
}

const getThumbSourceFilePath = (entry) => {
    if (entry.type === ddb.entry.type.POINTCLOUD) return `.ddb/build/${entry.hash}/ept/ept.json`;
    else return entry.path;
};

const getTileSourceFilePath = (entry) => {
    if (entry.type === ddb.entry.type.POINTCLOUD) return `.ddb/build/${entry.hash}/ept/ept.json`;
    else if (entry.type === ddb.entry.type.GEORASTER) return `.ddb/build/${entry.hash}/cog/cog.tif`;
    else return entry.path;
};

router.get('/orgs/:org/ds', security.allowOrgOwnerOrPublicOrgOnly, asyncHandle(async (req, res) => {
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

    // const { org } = req.params;
   
    // const orgDir = path.join(Directories.storagePath, org);

    // // Path traversal check
    // if (orgDir.indexOf(Directories.storagePath) !== 0){
    //     cb(new Error("Invalid path"));
    //     return;
    // }

    // fs.exists(orgDir, exists => {
    //     if (exists){
    //         fs.readdir(orgDir, { withFileTypes: true }, (err, files) => {
    //             if (err) res.status(400).json({error: err.message});
    //             else{
    //                 res.json(files.filter(f => f.isDirectory()).map(f => {
    //                     return {
    //                         slug: f.name,
    //                         creationDate: new Date(fs.statSync(path.join(orgDir, f.name)).ctime.getTime()).toISOString()
    //                         // name: path.basename(f)
    //                         // TODO: more?
    //                     };
    //                 }));
    //             }
    //         });
    //     }else{
    //         res.json([]);
    //     }
    // });
}));

router.get('/orgs/:org/ds/:ds', getDDBPath, security.allowDatasetRead, asyncHandle(async (req, res) => {
    if (Mode.singleDB){
        // Single database
        const info = await ddb.info(Directories.singleDBPath, { withHash: false, stoponError: true });
        info[0].depth = 0;
        info[0].path = ddbUrlFromReq(req);
        ddbUrlFromReq(req, info);
        res.json(info);
        return;
    }

    // TODO!
}));

router.put('/orgs/:org/ds/:ds', formDataParser, getDDBPath, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    const { name, isPublic } = req.body;

    if (isPublic !== undefined) await ddb.chattr(req.ddbPath, {public: Boolean(isPublic)});
    if (Mode.singleDB){
        if (name !== undefined) await ddb.meta.set(req.ddbPath, "", "name", name);
    }else{
        // TODO
    }

    res.json({name, isPublic});
}));

router.post('/orgs/:org/ds/:ds/list', formDataParser, security.allowDatasetRead, asyncHandle(async (req, res) => {
    const paths = req.body.path ? [req.body.path.toString()] : ".";
    res.json(await ddb.list(req.ddbPath, paths));
}));

router.get('/orgs/:org/ds/:ds/thumb', security.allowDatasetRead, asyncHandle(async (req, res) => {
    if (!req.query.path) throw new Error("Invalid path");

    const thumbSize = parseInt(req.query.size) || 512;
    if (isNaN(thumbSize) || thumbSize < 1) throw new Error("Invalid size");

    const filePath = path.join(req.ddbPath, req.query.path);
    if (filePath.indexOf(req.ddbPath) !== 0) throw new Error("Invalid path");
    
    const entry = await ddb.get(req.ddbPath, req.query.path);
    const tsPath = path.join(req.ddbPath, getThumbSourceFilePath(entry));

    const thumbFile = await ddb.thumbs.getFromUserCache(tsPath, { thumbSize });
    res.sendFile(thumbFile);
}));

router.get('/orgs/:org/ds/:ds/tiles/:tz/:tx/:ty.png', security.allowDatasetRead, asyncHandle(async (req, res) => {
    if (req.query.path === undefined) throw new Error("Invalid path");
    let { tz, tx, ty } = req.params;
    let tileSize = 256;
    
    tz = parseInt(tz);
    if (isNaN(tz)) throw new Error("Invalid tz");
    tx = parseInt(tx);
    if (isNaN(tx)) throw new Error("Invalid tx");

    if (typeof ty === "string"){
        if (ty.endsWith("@2x")){
            tileSize *= 2;
        }
    }
    ty = parseInt(ty);
    if (isNaN(ty)) throw new Error("Invalid ty");

    const filePath = path.join(req.ddbPath, req.query.path);
    if (filePath.indexOf(req.ddbPath) !== 0) throw new Error("Invalid path");

    const entry = await ddb.get(req.ddbPath, req.query.path);
    const tsPath = path.join(req.ddbPath, getTileSourceFilePath(entry));

    const tileFile = await ddb.tile.getFromUserCache(tsPath, tz, tx, ty, { tileSize, tms: true });
    res.sendFile(tileFile);
}));

router.post('/orgs/:org/ds/:ds/search', formDataParser, security.allowDatasetRead, asyncHandle(async (req, res) => {
    let { query } = req.body;

    if (typeof query !== 'string') throw new Error("Invalid query");

    query = query.replace(/%/g, "*");
    const entries = await ddb.search(req.ddbPath, query);
    res.json(entries);
}));

router.get('/orgs/:org/ds/:ds/download/get/:uuid', handleDownloadFile);
router.get('/orgs/:org/ds/:ds/download', formDataParser, security.allowDatasetRead, asyncHandle(handleDownload));
router.get('/orgs/:org/ds/:ds/download/:path*', formDataParser, security.allowDatasetRead, asyncHandle(handleDownload));
router.post('/orgs/:org/ds/:ds/download', formDataParser, security.allowDatasetRead, asyncHandle(handleDownload));

router.post('/orgs/:org/ds/:ds/chattr', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    if (!req.body.attrs) throw new Error("Missing attributes");
    res.status(200).json(await ddb.chattr(req.ddbPath, JSON.parse(req.body.attrs)));
}));

router.post('/orgs/:org/ds/:ds/rename', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    if (Mode.singleDB){
        res.json({slug: req.params.ds}); // Don't allow changes
        return;
    }

    if (!Tag.validComponent(req.body.slug)){
        throw new Error(`Invalid name. must be valid ASCII and may contain lowercase 
            and uppercase letters, digits, underscores, periods and dashes.
            A tag name may not start with a period or a dash and may contain 
            a maximum of 128 characters.`);
    }

    const { org, ds } = req.params;
    const newDs = req.body.slug;

    
    // Check if name already exists
    const oldPath = path.join(Directories.storagePath, org, ds);
    if (oldPath.indexOf(path.join(Directories.storagePath, org)) !== 0) throw new Error("Invalid dataset");
    
    const newPath = path.join(Directories.storagePath, org, newDs);
    if (newPath === oldPath){
        // Nothing to do
        res.status(200).json({slug: newDs});
        return;
    }

    if (await fsExists()){
        throw new Error("A dataset with the same name already exist");
    }

    await fsMove(oldPath, newPath);

    res.status(200).json({slug: newDs});
}));

router.get('/orgs/:org/ds/:ds/meta/get/:key', security.allowDatasetRead, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.get(req.ddbPath, req.query.path, req.params.key));
}));
router.get('/orgs/:org/ds/:ds/meta/list', security.allowDatasetRead, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.list(req.ddbPath, req.query.path));
}));
router.post('/orgs/:org/ds/:ds/meta/add', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.add(req.ddbPath, formOrQueryParam(req, "path"), 
                                             formOrQueryParam(req, "key"), 
                                             formOrQueryParam(req, "data")));
}));
router.post('/orgs/:org/ds/:ds/meta/set', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.set(req.ddbPath, formOrQueryParam(req, "path"), 
                                             formOrQueryParam(req, "key"), 
                                             formOrQueryParam(req, "data")));
}));
router.post('/orgs/:org/ds/:ds/meta/remove', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.remove(req.ddbPath, formOrQueryParam(req, "id")));
}));
router.post('/orgs/:org/ds/:ds/meta/unset', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.remove(req.ddbPath, formOrQueryParam(req, "path"), formOrQueryParam(req, "key")));
}));

router.post('/orgs/:org/ds/:ds/obj', uploadParser("file"), security.allowDatasetWrite, asyncHandle(async (req, res) => {
    if (req.body.path === undefined) throw new Error("Path missing");
    
    checkAllowedPath(req.ddbPath, req.body.path);

    const destPath = path.join(req.ddbPath, req.body.path);

    if (req.filePath !== undefined){
        // Move file to database
        await fsMove(req.filePath, destPath);
    }else{
        // Directory
        await fsMkdir(destPath, { recursive: true});
    }

    // Add to index
    const entries = await ddb.add(req.ddbPath, req.body.path);
    res.json(entries[0]);
}));

module.exports = {
    api: router
}