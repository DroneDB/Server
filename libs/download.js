const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const archiver = require('archiver');
const { fsExists, fsLstat } = require('./fs');


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
            // Add everything except .ddb
            archive.glob("**/!(*.ddb)", { cwd: dt.ddbPath });
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
    handleDownloadFile: async (req, res) => {
        const { uuid } = req.params;

        const dt = downloadTasks[uuid];
        if (!dt){
            res.status(400).json({error: "Invalid download"});
            return;
        }

        await handleDownloadTask(res, dt);
    },

    handleDownload: async (req, res) => {
        const { org, ds } = req.params;

        let paths = [];
        if (req.method === "GET" && typeof req.query.path === "string"){
            paths = req.query.path.split(',').map(decodeURIComponent);
        }else if (req.method === "GET" && req.params.path !== undefined){
	        paths = decodeURIComponent((new URL(`http://localhost${req.url}`)).pathname.substring(`/orgs/${org}/ds/${ds}/download/`.length));
        }else if (req.method === "POST" && req.body.path){
            paths = req.body.path.split(',');
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

        const downloadUrl = uuid => {
            return `/orgs/${org}/ds/${ds}/download/get/${uuid}`;
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
                res.status(200).json({downloadUrl: downloadUrl(uuid)});
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
                
                // if (req.method === "POST"){
                    // res.status(200).json({downloadUrl: downloadUrl(uuid)});
                // }else{
                await handleDownloadTask(res, downloadTasks[uuid]);
                // }
            }catch(e){
                await die(`Cannot download dataset: ${e.message}`);
            }
        }
    }
}
