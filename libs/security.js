const { userAuth } = require('./jwt');
const { PUBLIC_ORG_NAME } = require('./tag');
const logger = require('./logger');
const { getDDBPath } = require('./middleware');
const ddb = require('../vendor/ddb');

const allowAnonymous = function (req, res, next){
    req.allowAnonymous = true;
    next();
};

const allowLoggedIn = userAuth;

const allowAdmin = [userAuth, (req, res, next) => {
    if (!req.user || !req.user.username) res.status(401).json({error: "Unauthorized"});
    else if (!req.user.roles || req.user.roles.indexOf("admin") === -1) res.status(401).json({error: "Unauthorized"});
    else next();
}];

const checkOrgOwner = function(req, res){
    const { org } = req.params;

    if (!org) throw new Error("Missing organization param");

    // Admins own everything
    if (req.user?.username){
        if (req.user.roles.indexOf("admin") !== -1) return true;
        return req.user.username && req.user.username == org;
    }else{
        return false;
    }
};

const allowOrgOwnerOrPublicOrgOnly = [allowAnonymous, userAuth, function(req, res, next){
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


const allowDatasetWrite = [userAuth, getDDBPath, function(req, res, next){
    if (checkOrgOwner(req, res)){
        next();
    }else{
        res.status(401).json({error: "Unauthorized"});
    }
}];
const allowOrgWrite = allowDatasetWrite;

const allowDatasetOwnerOrPasswordOnly = [allowAnonymous, userAuth, function(req, res, next){
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

const allowDatasetRead = [allowAnonymous, userAuth, getDDBPath, async function(req, res, next){
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
        if (info[0].properties.public){
            next();
            return;
        }
    }catch(e){
        logger.error(e);
    }

    res.status(401).json({error: "Unauthorized"});
}];

module.exports = {
    allowAnonymous,
    allowOrgOwnerOrPublicOrgOnly,
    allowDatasetOwnerOrPasswordOnly,
    allowDatasetWrite,
    allowDatasetRead,
    allowOrgWrite,
    allowLoggedIn,
    allowAdmin
};
