const { readJwt } = require('./jwt');
const { PUBLIC_ORG_NAME } = require('./tag');
const logger = require('./logger');
const { getDDBPath } = require('./dataset');
const ddb = require('../vendor/ddb');

const checkOrgOwner = function(req, res){
    const { org } = req.params;

    if (!org) res.status(400).json({error: "Missing organization param"});
    
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

const allowDatasetOwnerOnly = [readJwt, function(req, res, next){
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

module.exports = {
    allowOrgOwnerOrPublicOrgOnly,
    allowDatasetOwnerOrPasswordOnly,
    allowDatasetOwnerOnly,
    allowDatasetRead
};
