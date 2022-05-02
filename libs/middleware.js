const path = require('path');
const { fsExists } = require('./fs');
const Mode = require('./Mode');
const Directories = require('./Directories');

async function getDDBPath(req, res, next){
    if (Mode.singleDB){
        req.ddbPath = Directories.singleDBPath;
        next();
        return;
    }

    const { org, ds } = req.params;
        
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

module.exports = {
    getDDBPath
};