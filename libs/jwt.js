const jwt = require('jsonwebtoken');
const db = require('./db');
const crypto = require('crypto');

const DEFAULT_EXPIRATION_HOURS = 6;

let secret = null;

const readJwt = function(req, res, next){
    
    req.user = {};
    
    let token = null;

    let authHeader = req.headers['authorization'];
    if (authHeader && authHeader.match(/^Bearer/i)) token = authHeader.replace(/^Bearer /i, "");

    if (!token){
        // Check cookie
        token = req.cookies['jwtToken'];
    }

    if (!token){
        // Check req
        token = req.token;
    }

    if (token) {
        try{
            const decoded = jwt.verify(token, secret, { algorithms: ["HS256"]});
            req.user = decoded;
            next();
        }catch(e){
            err = new Error("Token expired");
            err.name = 'UnauthorizedError';
            next(err);
        }
    }else{
        next();
    }

};

const populateRoles = function(req, res, next){
    if (req.user !== undefined){
        req.user.roles = db.fetchMultiple(`SELECT r.role AS role 
                    FROM users u, roles r
                    INNER JOIN user_roles ur ON u.id = ur.user_id AND r.id = ur.role_id
                    WHERE u.username = ?`, req.user.username).map(r => r['role']);
    }
    next();
}

module.exports = {
    DEFAULT_EXPIRATION_HOURS,
    initialize: function(){
        db.setIfNotExists("jwt_secret", crypto.randomBytes(32).toString('hex'));
        secret = db.get("jwt_secret");
    },
    
    readJwt,
    userAuth: [readJwt, function(req, res, next){
    	if (!req.allowAnonymous && !req.user.username) res.status(401).json({error: "Unauthorized"});
 
    	else next();
    }, populateRoles],
    sign: function(data){
        return jwt.sign(data, secret, { expiresIn: DEFAULT_EXPIRATION_HOURS + 'h' });
    }
}
