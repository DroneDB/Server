const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const rmdir = require('rimraf');
const Directories = require('./Directories');
const mv = require('mv');
const async = require('async');
const tag = require('./tag');
const ddb = require('../vendor/ddb');
const { PUBLIC_ORG_NAME } = require('./tag');
const express = require('express');
const router = express.Router();
const { userAuth } = require('./users');
const { formDataParser } = require('./parsers');

const removeDirectory = function(dir, cb = () => {}){
    fs.stat(dir, (err, stats) => {
        if (!err && stats.isDirectory()) rmdir(dir, cb); // ignore errors, don't wait
        else cb(err);
    });
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const folderPath = path.join("tmp", req.id);

            fs.exists(folderPath, exists => {
                if (!exists) {
                    fs.mkdir(folderPath, undefined, () => {
                        cb(null, folderPath);
                    });
                } else {
                    cb(null, folderPath);
                }
            });
        },
        filename: (req, file, cb) => {
            const filename = uuidv4();
            req.tmpUploadFilePath = path.join("tmp", req.id, filename);

            cb(null, filename);
        }
    })
});

const assignUUID = (req, res, next) => {
    req.id = uuidv4().replace(/-/g, '');
    next();
}

const getUUID = (req, res, next) => {
    req.id = req.params.uuid;
    if (!req.id) res.status(400).json({error: `Invalid uuid (not set)`});

    const srcPath = path.join("tmp", req.id);
    const bodyFile = path.join(srcPath, "__body.json");

    fs.access(bodyFile, fs.F_OK, err => {
        if (err) res.json({error: `Invalid uuid (not found)`});
        else next();
    });
}

const uploadFile = [upload.single("file"), (req, res, next) => {
    let ddbPath;
    let filePath; 

    try{
        if (!req.tmpUploadFilePath){
            throw new Error("Missing tmp upload file path");
        }
        if (!req.body.path){
            throw new Error("path field missing");
        }

        if (!req.body.path === "__body.json"){
            throw new Error("invalid path");
        }

        ddbPath = path.join("tmp", req.id);
        filePath = path.join(ddbPath, req.body.path);
        
        // Path traversal check
        if (filePath.indexOf(ddbPath) !== 0){
            throw new Error("Invalid path");
        }
    }catch(e){
        res.status(400).json({error: e.message});
        return;
    }
    
    const folderPath = path.dirname(filePath);

    async.series([
        cb => {
            // Create dir
            fs.exists(folderPath, exists => {
                if (!exists) {
                    fs.mkdir(folderPath, {recursive: true}, () => {
                        cb(null, folderPath);
                    });
                } else {
                    cb(null, folderPath);
                }
            });
        },

        // TODO: remove from ddb index (allows re-uploads)

        cb => mv(req.tmpUploadFilePath, filePath, cb),
        cb => {
            req.filePath = filePath;
            cb();
        }
    ], (err, _) => {
        if (err) res.status(400).json({error: err.message});
        else next();
    });
}];


const handleUpload = (req, res) => {
    const ddbPath = path.join("tmp", req.id);

    if (req.file){
        ddb.add(ddbPath, req.filePath)
            .then(entries => {
                const e = entries.find(e => !ddb.entry.isDirectory(e));
                if (e){
                    res.json({
                        hash: e.hash,
                        size: e.size,
                        path: e.path
                    });
                }else{
                    res.status(400).json({error: "Cannot add file (already added?)"});
                }
            })
            .catch(e => {
                res.status(400).json({error: e.message});
            });
    }else{
        res.status(400).json({error: "Need to upload 1 file."});
    }
}

const handleCommit = (req, res) => {
    const srcPath = path.join("tmp", req.id);
    const bodyFile = path.join(srcPath, "__body.json");

    let body = {};
    let tagComp = null;
    let destDir = null;

    async.series([
        cb => {
            fs.readFile(bodyFile, 'utf8', (err, data) => {
                if (err) cb(err);
                else{
                    try{
                        body = JSON.parse(data);
                        fs.unlink(bodyFile, err => {
                            if (err) cb(err);
                            else cb(null, body);
                        });
                    }catch(e){
                        cb(new Error("Malformed __body.json"));
                    }
                }
            });
        },

        cb => {
            tagComp = tag.parseOrCreateTag(body.tag);
            destDir = path.join(Directories.storagePath, tagComp.organization, tagComp.dataset)
            const parentDir = path.join(destDir, "..");

            fs.stat(destDir, (err, stat) => {
                if (err && err.code === 'ENOENT') fs.mkdir(parentDir, {recursive: true}, cb);
                else{
                    // Dir already exist, remove it
                    rmdir(destDir, err => {
                        if (err) cb(err);
                        else fs.mkdir(parentDir, {recursive: true}, cb);
                    });
                }
            });
        }
    ], (err) => {
        if (err){
            res.status(400).json({error: err.message});
            return;
        }

        mv(srcPath, destDir, err => {
            if (err) res.status(400).json({error: err.message});
            else res.json({url: `/r/${tagComp.organization}/${tagComp.dataset}`, tag: tag.dump(tagComp)});
        });
    });
}

const handleInit = (req, res) => {
    const srcPath = path.join("tmp", req.id);
    const bodyFile = path.join(srcPath, "__body.json");

    // Print error message and cleanup
    const die = (error) => {
        res.json({error});
        removeDirectory(srcPath);
    };

    const t = tag.parseOrCreateTag(req.body.tag);

    // Fill organization if missing
    if (t.organization.trim() === "" || t.organization === PUBLIC_ORG_NAME){
        // TODO: support for anonymous users
        t.organization = req.user.username;
    }
    
    // Check that we can create a dataset under the requested org
    if (t.organization !== req.user.username && t.organization !== tag.PUBLIC_ORG_NAME){
        res.status(401).json({error: `You're not authorized to upload to this organization.`});
        return;
    }

    async.series([
        cb => {
            fs.stat(srcPath, (err, stat) => {
                if (err && err.code === 'ENOENT') fs.mkdir(srcPath, undefined, cb);
                else cb(); // Dir already exists
            });
        },
        cb => {
            // Update body tag
            req.body.tag = tag.dump(t);

            fs.writeFile(bodyFile, JSON.stringify(req.body), {encoding: 'utf8'}, cb);
        },
        cb => {
            ddb.init(srcPath).then(() => cb())
                             .catch(e => cb(e));
        },
        cb => {
            // Set public
            ddb.chattr(srcPath, { public: true })
                    .then(() => cb())
                    .catch(e => cb(e));
        },
        cb => {
            res.json({token: req.id, maxUploadChunkSize: 2147483647});
            cb();
        }
    ],  err => {
        if (err) die(err.message);
    });
}

router.post('/share/init', userAuth, assignUUID, formDataParser, handleInit);
router.post('/share/upload/:uuid', userAuth, getUUID, uploadFile, handleUpload);
router.post('/share/commit/:uuid', userAuth, getUUID, handleCommit);


module.exports = {
    api: router
};
