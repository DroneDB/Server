const ddb = require('../vendor/ddb');
const Directories = require('./Directories');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('./logger');
const util = require('util');
const config = require('../config');
const archiver = require('archiver');

const fsExists = util.promisify(fs.exists);
const fsLstat = util.promisify(fs.lstat);
const fsRename = util.promisify(fs.rename);


const { Tag } = ddb;

async function getDDBPath(req, res, next){
    const { org, ds } = req.params;

    console.log("REMOVE ME!!");
        
    req.ddbPath = path.join(Directories.storagePath, org, ds);

    // Path traversal check
    if (req.ddbPath.indexOf(Directories.storagePath) !== 0){
        res.status(400).json({error: "Invalid path"});
        return;
    }

    // Dir check
    if (!(await fsExists(req.ddbPath))){
        res.status(400).json({error: "Invalid path"});
        return;
    }

    next();
}

const downloadTasks = {};

// Cleanup stale tasks
setInterval(async () => {
    const tasksToCleanup = [];

    for (let uuid in downloadTasks){
        const dt = downloadTasks[uuid];

        // Remove tasks two days old 
        if (dt.created + 1000 * 60 * 60 * 24 * 2  < new Date().getTime()){
            tasksToCleanup.push(uuid);
        }
    }

    for (let i = 0; i < tasksToCleanup.length; i++){
        const uuid = tasksToCleanup[i];
        delete downloadTasks.uuid;
    }
}, 2000);

async function handleDownloadTask(res, dt){
    let archive = archiver.create('zip', {
        zlib: { level: 1 } // Sets the compression level (1 = best speed since most assets are already compressed)
    });

    archive.on('error', err => {
        logger.error(err);
        if (!res.headersSent) res.status(400).json({error});
    });

    if (!dt.useZip && dt.paths.length === 1){
        if (dt.inline){
            res.sendFile(path.resolve(path.join(dt.ddbPath, dt.paths[0])), {
                headers: { "content-disposition": `inline; filename=${dt.friendlyName}` }
            });
        }else{
            res.download(path.resolve(path.join(dt.ddbPath, dt.paths[0])), dt.friendlyName);
        }
    }else{
        res.attachment(dt.friendlyName);

        archive.pipe(res);

        if (dt.addAll){
            // Add everything
            // TODO: do not return .ddb?
            archive.directory(dt.ddbPath, false);
        }else{
            for (let i = 0; i < dt.paths.length; i++){
                const p = dt.paths[i];
                const fullP = path.join(dt.ddbPath, p);

                if ((await fsLstat(fullP)).isDirectory()){
                    archive.directory(fullP, p);
                }else{
                    archive.file(fullP, {name: p});
                }
            }
        }

        archive.finalize();
    }
}

module.exports = {
    getDDBPath,
    
    handleDownloadFile: async (req, res) => {
        const { uuid } = req.params;

        const dt = downloadTasks[uuid];
        if (!dt){
            res.status(400).json({error: "Invalid download"});
            return;
        }

        await handleDownloadTask(res, dt);
    },

    handleList: [getDDBPath, async (req, res) => {
        const paths = req.body.path ? [req.body.path.toString()] : ".";

        try{
            res.json(await ddb.list(req.ddbPath, paths));
        }catch(e){
            res.status(400).json({error: e.message});
        }

    }],

    handleInfo: [getDDBPath, async (req, res) => {
        try{
            const entries = await ddb.info(req.ddbPath);
            if (!entries.length) throw new Error("Cannot find dataset");
            
            const entry = entries[0];

            // Override depth and path
            entry.depth = 0;

            const proto = config.ssl ? "ddb" : "ddb+unsafe";
            entry.path = `${proto}://${req.headers.host}/${req.params.org}/${req.params.ds}`;

            res.json(entries);
        }catch(e){
            res.status(400).json({error: e.message});
        }
    }],

    handleRename: [getDDBPath, async (req, res) => {
        try{
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

            await fsRename(oldPath, newPath);

            res.status(200).json({slug: newDs});
        }catch(e){
            res.status(400).json({error: e.message});
        }
    }],

    handleDownload: [getDDBPath, async (req, res) => {
        const { org, ds } = req.params;

        let paths = [];
        if (req.method === "GET" && typeof req.query.path === "string"){
            paths = req.query.path.split(',');
        }else if (req.method === "GET" && req.params.path !== undefined){
	        paths = (new URL(`http://localhost${req.url}`)).pathname.substring(`/orgs/${org}/ds/${ds}/download/`.length);
        }else if (req.method === "POST" && req.body.path){
            paths = req.body.path;
        }
        
        if (typeof paths === "string") paths = [paths];
        
        // Generate UUID
        const hash = crypto.createHash('sha256');
        const uuid = hash.update(`${Math.random()}/${new Date().getTime()}`).digest("hex");
        let isSingleDirectory = false;
        if (paths.length === 1){
            isSingleDirectory = (await fsLstat(path.join(req.ddbPath, paths[0]))).isDirectory();
        }
        const useZip = (paths.length === 0) || (paths.length > 1) || isSingleDirectory;

        const die = async (error) => {
            logger.error(error);
            const dt = downloadTasks[uuid];
            if (dt) dt.error = error;
            if (!res.headersSent) res.status(400).json({error});
        };

        if (!useZip){
            // Download directly, easy
            const file = paths[0];
            const fullPath = path.join(req.ddbPath, file);

            if (!await fsExists(fullPath)){
                await die("Invalid path");
                return;
            }

            // Path traversal check
            if (fullPath.indexOf(req.ddbPath) !== 0){
                await die("Invalid path");
                return;
            }

            downloadTasks[uuid] = {
                paths: [file],
                ddbPath: req.ddbPath,
                useZip: false,
                inline: !!req.query.inline,
                friendlyName: path.basename(file),
                created: new Date().getTime()
            };

            if (req.method === "POST"){
                res.status(200).json({downloadUrl: `/download/${uuid}`});
            }else{
                await handleDownloadTask(res, downloadTasks[uuid]);
            }
        }else{
            try{
                // Remove duplicates
                paths = [...new Set(paths)];

                // Basic path checks
                for (let i = 0; i < paths.length; i++){
                    const p = paths[i];
                    const fullP = path.join(req.ddbPath, p);
    
                    // Path traversal check
                    if (fullP.indexOf(req.ddbPath) !== 0){
                        await die(`Invalid path: ${p}`);
                        return;
                    }

                    if (!(await fsExists(fullP))){
                        await die(`Invalid path: ${p}`);
                        return;
                    }
                }
              
                downloadTasks[uuid] = {
                    paths,
                    addAll: paths.length === 0,
                    ddbPath: req.ddbPath,
                    useZip: true,
                    inline: false,
                    friendlyName: `${org}-${ds}.zip`,
                    created: new Date().getTime()
                };
                
                if (req.method === "POST"){
                    res.status(200).json({downloadUrl: `/download/${uuid}`});
                }else{
                    await handleDownloadTask(res, downloadTasks[uuid]);
                }
            }catch(e){
                await die(`Cannot download dataset: ${e.message}`);
            }
        }
    }],

    handleDelete: [getDDBPath, async (req, res) => {
        fs.rmdir(req.ddbPath, { recursive: true, maxRetries: 5}, err => {
            if (!err) res.status(204).send("");
            else{
                res.status(400).json({error: `Could not delete ${req.params.org}/${req.params.ds}`});
            }
        });
    }],

    handleThumb: [getDDBPath, async (req, res) => {
        try{
            if (!req.query.path) throw new Error("Invalid path");

            const thumbSize = parseInt(req.query.size) || 512;
            if (isNaN(thumbSize) || thumbSize < 1) throw new Error("Invalid size");
    
            const filePath = path.join(req.ddbPath, req.query.path);
            if (filePath.indexOf(req.ddbPath) !== 0) throw new Error("Invalid path");

            const thumbFile = await ddb.thumbs.getFromUserCache(filePath, { thumbSize });
            res.sendFile(thumbFile);
        }catch(e){
            res.status(400).json({error: e.message});
        }
    }],

    handleTile: [getDDBPath, async (req, res) => {
        try{
            if (!req.query.path) throw new Error("Invalid path");
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

            const tileFile = await ddb.tile.getFromUserCache(filePath, tz, tx, ty, { tileSize, tms: true });
            res.sendFile(tileFile);
        }catch(e){
            res.status(400).json({error: e.message});
        }
    }],

    handleChattr: [getDDBPath, async (req, res) => {
        try{
            if (!req.body.attrs) throw new Error("Missing attributes");
            
            res.status(200).json(await ddb.chattr(req.ddbPath, JSON.parse(req.body.attrs)));
        }catch(e){
            res.status(400).json({error: e.message});
        }
    }]
}
