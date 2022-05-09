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

module.exports = {
    DEFAULT_EXPIRATION_HOURS,
    initialize: function(){
        db.setIfNotExists("jwt_secret", crypto.randomBytes(32).toString('hex'));
        secret = db.get("jwt_secret");
    },
    
    readJwt,
    jwtAuth: [readJwt, function(req, res, next){
    	if (!req.user.username) res.status(401).json({error: "Unauthorized"});
 
    	else next();
    }],
    sign: function(data){
        return jwt.sign(data, secret, { expiresIn: DEFAULT_EXPIRATION_HOURS + 'h' });
    }
}
