const jwt = require('jsonwebtoken');
const db = require('./db');
const crypto = require('crypto');

const DEFAULT_EXPIRATION_HOURS = 6;

let secret = null;

const readJwt = function(req, res, next){
    req.user = {};
    
    let token = req.headers['authorization'];
    if (token) token = token.replace(/^Bearer /i, "");

    if (!token){
        // Check cookie
        token = req.cookies['jwtToken'];
    }
    if (token) {
        try{
            const decoded = jwt.verify(token, secret, { algorithms: ["HS256"]});
            req.user = decoded;
            
            // Populate info from db
            req.user.roles = db.fetchMultiple(`SELECT r.role AS role 
                FROM users u, roles r 
                INNER JOIN user_roles ur ON u.id = ur.user_id AND r.id = ur.role_id 
                WHERE u.username = ?`, req.user.username).map(r => r['role']);
        }catch(e){
            err = new Error("Token expired");
            err.name = 'UnauthorizedError';
            next(err);
        }
    }

    next();
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
