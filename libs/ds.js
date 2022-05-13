const security = require('./security');
const Mode = require('./Mode');
const tag = require('./tag');
const express = require('express');
const router = express.Router();
const ddb = require('../vendor/ddb');
const Directories = require('./Directories');
const path = require('path');
const { fsMove, fsMkdir, fsRm, fsExists, fsStat, fsReaddir, fsCreationDate } = require('./fs');
const { formDataParser, uploadParser } = require('./parsers');
const { asyncHandle, allowNewDDBPath, getDsFromFormData } = require('./middleware');
const { handleDownload, handleDownloadFile } = require('./download');
const { basicAuth } = require('./basicauth');
const { formOrQueryParam } = require('./requtils');
const { checkAllowedPath, checkAllowedBuildPath } = require('./ds_security');

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
            slug: ddb.Tag.filterComponentChars(name.length ? name : 'default'),
            creationDate: (await fsCreationDate(Directories.singleDBPath)).toISOString(),
            size: info[0].size,
            properties: info[0].properties
        }]);
        return;
    }

    const { org } = req.params;
    
    // // Path traversal check
    security.pathTraversalCheck(Directories.storagePath, org);
    const orgDir = path.join(Directories.storagePath, org);
    if (await fsExists(orgDir)){
        const files = await fsReaddir(orgDir);
        const entries = (await ddb.info(files.map(f => path.join(orgDir, f)))).filter(e => e.type === ddb.entry.type.DRONEDB);
        const datasets = [];
        
        for (let i = 0; i < entries.length; i++){
            const e = entries[i];

            const name = path.basename(e.path);
            datasets.push({
                slug: name,
                creationDate: (await fsCreationDate(path.join(orgDir, name))).toISOString(),
                size: e.size,
                properties: e.properties
            });
        }

        res.json(datasets);
    }else{
        res.json([]);
    }
}));

router.post('/orgs/:org/ds', allowNewDDBPath, getDsFromFormData("slug"), security.allowOrgWrite, asyncHandle(async (req, res) => {
    if (Mode.singleDB) throw new Error("Not allowed in singleDB mode");

    const { org } = req.params;
    let { slug, name, isPublic } = req.body;

    if (!ddb.Tag.validComponent(slug)) throw new Error("Invalid slug");
    if (name !== undefined) name = String(name);
    if (isPublic !== undefined) isPublic = false;

    slug = String(slug);
    isPublic = Boolean(isPublic);

    const orgPath = path.join(Directories.storagePath, org);
    const dsPath = security.safePathJoin(orgPath, slug);

    if (await fsExists(dsPath)) throw new Error(`${slug} already exists`);

    await fsMkdir(dsPath);
    await ddb.init(dsPath);

    if (name !== undefined) await ddb.meta.set(dsPath, "", "name", name);
    await ddb.chattr(dsPath, { public: isPublic });

    const info = await ddb.info(dsPath);

    res.json({
        slug: path.basename(info[0].path),
        size: 0,
        properties: info[0].properties,
        creationDate: (await fsCreationDate(dsPath)).toISOString()
    });
}));

router.get('/orgs/:org/ds/:ds', security.allowDatasetRead, asyncHandle(async (req, res) => {
    const info = await ddb.info(req.ddbPath, { withHash: false, stoponError: true });
    info[0].depth = 0;
    info[0].path = ddbUrlFromReq(req);
    info[0].hash = null;
    res.json(info);
}));

router.put('/orgs/:org/ds/:ds', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    const { name, isPublic } = req.body;

    if (isPublic !== undefined) await ddb.chattr(req.ddbPath, {public: Boolean(isPublic)});
    if (name !== undefined) await ddb.meta.set(req.ddbPath, "", "name", name);

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

    const slug = ddb.Tag.filterComponentChars(req.body.slug);
    console.log(slug);
    if (!ddb.Tag.validComponent(slug)){
        throw new Error(`Invalid name. must be valid ASCII and may contain lowercase 
            and uppercase letters, digits, underscores, periods and dashes.
            A tag name may not start with a period or a dash and may contain 
            a maximum of 128 characters.`);
    }

    const { org, ds } = req.params;
    
    // Check if name already exists
    const oldPath = path.join(Directories.storagePath, org, ds);
    if (oldPath.indexOf(path.join(Directories.storagePath, org)) !== 0) throw new Error("Invalid dataset");
    
    const newPath = path.join(Directories.storagePath, org, slug);
    if (newPath === oldPath){
        // Nothing to do
        res.status(200).json({slug});
        return;
    }

    if (await fsExists()){
        throw new Error("A dataset with the same name already exist");
    }

    await fsMove(oldPath, newPath);

    res.status(200).json({slug});
}));

router.get('/orgs/:org/ds/:ds/stamp', security.allowDatasetRead, asyncHandle(async (req, res) => {
    res.json(await ddb.getStamp(req.ddbPath));
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
router.post('/orgs/:org/ds/:ds/meta/dump', security.allowDatasetRead, asyncHandle(async (req, res) => {
    res.json(await ddb.meta.dump(req.ddbPath, formOrQueryParam(req, "ids")));
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

    ddb.build(req.ddbPath, { path: req.body.path });
    ddb.build(req.ddbPath, { pendingOnly: true });
}));

router.delete('/orgs/:org/ds/:ds/obj', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    if (req.body.path === undefined) throw new Error("Path missing");
    
    checkAllowedPath(req.ddbPath, req.body.path);

    const removePath = path.join(req.ddbPath, req.body.path);

    // Remove from index
    await ddb.remove(req.ddbPath, req.body.path);
    
    await fsRm(removePath, { recursive: true });

    res.status(204).send("");
}));

router.put('/orgs/:org/ds/:ds/obj', formDataParser, security.allowDatasetWrite, asyncHandle(async (req, res) => {
    if (req.body.source === undefined) throw new Error("Source missing");
    if (req.body.dest === undefined) throw new Error("Dest missing");
    
    checkAllowedPath(req.ddbPath, req.body.source);
    checkAllowedPath(req.ddbPath, req.body.dest);
    
    const sourcePath = path.join(req.ddbPath, req.body.source);
    const destPath = path.join(req.ddbPath, req.body.dest);

    // Remove from index
    await ddb.move(req.ddbPath, req.body.source, req.body.dest);
    
    await fsMove(sourcePath, destPath);

    res.status(204).send("");
}));

router.head('/orgs/:org/ds/:ds/build/:hash/*', asyncHandle(basicAuth), security.allowDatasetRead, asyncHandle(async (req, res) => {
    const p = req.params['0'] !== undefined ? req.params['0'] : "";
    const buildPath = path.join(".ddb", "build", req.params.hash, p);
    checkAllowedBuildPath(req.ddbPath, buildPath);

    if (await fsExists(path.join(req.ddbPath, buildPath))) res.status(200).send();
    else res.status(404).send();
}));
router.get('/orgs/:org/ds/:ds/build/:hash/*', asyncHandle(basicAuth), security.allowDatasetRead, asyncHandle(async (req, res) => {
    const p = req.params['0'] !== undefined ? req.params['0'] : "";
    const buildPath = path.join(".ddb", "build", req.params.hash, p);
    checkAllowedBuildPath(req.ddbPath, buildPath);

    res.sendFile(path.resolve(path.join(req.ddbPath, buildPath)));
}));

module.exports = {
    api: router
}