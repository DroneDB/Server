const { readJwt } = require('./jwt');
const { PUBLIC_ORG_NAME } = require('./tag');
const logger = require('./logger');
const { getDDBPath } = require('./middleware');
const ddb = require('../vendor/ddb');
const path = require('path');

const checkOrgOwner = function(req, res){
    const { org } = req.params;

    if (!org) throw new Error("Missing organization param");

    // Admins own everything
    if (req.user.roles.indexOf("admin") !== -1) return true;
    
    return req.user.username && req.user.username == org;
};

const allowOrgOwnerOrPublicOrgOnly = [readJwt, function(req, res, next){
    if (checkOrgOwner(req, res)){
        next(); // Grant
        return;
    }

    const { org } = req.params;

    if (org === PUBLIC_ORG_NAME){
        next(); // Grant
        return;
    }

    res.status(401).json({error: "Unauthorized"});
}];

const allowDatasetWrite = [readJwt, getDDBPath, function(req, res, next){
    if (checkOrgOwner(req, res)){
        next();
    }else{
        res.status(401).json({error: "Unauthorized"});
    }
}];

const allowDatasetOwnerOrPasswordOnly = [readJwt, function(req, res, next){
    if (checkOrgOwner(req, res)){
        next(); // Grant
        return;
    }

    const { org } = req.params;

    if (org === PUBLIC_ORG_NAME){
        next(); // Grant
        return;
    }

    res.status(401).json({error: "Unauthorized"});
}];

const allowDatasetRead = [readJwt, getDDBPath, async function(req, res, next){
    if (checkOrgOwner(req, res)){
        next(); // Grant
        return;
    }

    const { org } = req.params;

    if (org === PUBLIC_ORG_NAME){
        next(); // Grant
        return;
    }

    try{
        const info = await ddb.info(req.ddbPath);
        if (info[0].meta.public){
            next();
            return;
        }
    }catch(e){
        logger.error(e);
    }

    res.status(401).json({error: "Unauthorized"});
}];

const pathTraversalCheck = (ddbPath, inputPath) => {
    if (path.resolve(ddbPath, inputPath).indexOf(ddbPath) !== 0){
        throw new Error(`Invalid path: ${inputPath}`);
    }
}

module.exports = {
    allowOrgOwnerOrPublicOrgOnly,
    allowDatasetOwnerOrPasswordOnly,
    allowDatasetWrite,
    allowDatasetRead,

    pathTraversalCheck
};
