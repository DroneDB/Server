const path = require('path');
const { fsExists } = require('./fs');
const Mode = require('./Mode');
const Directories = require('./Directories');
const { v4: uuidv4 } = require('uuid');
const { encode } = require('./base32');

function allowNewDDBPath(req, res, next){
    req.allowNewDDBPath = true;
    next();
}

async function getDDBPath(req, res, next){
    const { org, ds } = req.params;

    if (Mode.singleDB){
        if (org === "projects" && ds === path.basename(Directories.singleDBPath)){
            req.ddbPath = Directories.singleDBPath;
            next();
        }else{
            res.status(400).json({error: "No dataset found"});
        }
        return;
    }

    req.ddbPath = path.join(Directories.storagePath, org, ds);

    // Path traversal check
    if (req.ddbPath.indexOf(Directories.storagePath) !== 0){
        res.status(400).json({error: "Invalid path"});
        return;
    }

    // Dir check
    if (!req.allowNewDDBPath && !(await fsExists(req.ddbPath))){
        res.status(400).json({error: "Invalid path"});
        return;
    }

    next();
}

const asyncHandle = func => (req, res, next) => {
    if (Array.isArray(func) && func.length > 0){
        return new Promise(async (resolve, reject) => {
            const exec = async i => {
                if (i >= func.length){
                    resolve(next());
                    return;
                }

                try{
                    await (func[i])(req, res, async () => { await exec(i + 1)});
                }catch(e){
                    resolve(next(e));
                }
            };
            await exec(0);
        });
    }else{
        return Promise.resolve(func(req, res, next)).catch(next);
    }
};

const assignUUID = (req, res, next) => {
    req.id = encode(uuidv4().replace(/-/g, '')).substring(0, 12);
    next();
}

const noCache = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache');
    next();
};

module.exports = {
    allowNewDDBPath,
    getDDBPath,
    assignUUID,
    asyncHandle,
    noCache
};