const db = require('./db');
const logger = require('./logger');
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const jwt = require('./jwt');
const Mode = require('./Mode');
const Directories = require('./Directories');
const authProviders = require('./authProviders');
const { formDataParser } = require('./parsers');
const { jwtAuth, DEFAULT_EXPIRATION_HOURS } = jwt;
const ddb = require('../vendor/ddb');

const login = async function(username, password, token = null){
    const res = await authProviders.get().authenticate(username, password, token);
    return { token: jwt.sign(res), username: res.username };
};

const refreshToken = function(signObj){
    const newObj = Object.assign({}, signObj);
    delete newObj.iat;
    delete newObj.exp;

    return jwt.sign(newObj);
}

router.post('/users/authenticate', formDataParser, async (req, res) => {
    try{
        const userInfo = await login(req.body.username, req.body.password, req.body.token);

        res.json({
            username: userInfo.username,
            token: userInfo.token,
            expires: parseInt(((new Date().getTime() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000) / 1000).toFixed(0)),    
        });
    }catch(e){
        res.status(401).json({error: e.message});
    }
});

router.post('/users/authenticate/refresh', jwtAuth, (req, res) => {
    try{
        const token = refreshToken(req.user);

        res.json({
            token,
            expires: parseInt(((new Date().getTime() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000) / 1000).toFixed(0)),    
        });
    }catch(e){
        res.status(401).json({error: e.message});
    }
});

router.get('/users/storage', async (req, res) => {
    if (Mode.singleDB){
        const info = await ddb.info(Directories.singleDBPath, { withHash: false, stoponError: true });
        res.json({"total":null,"used":info[0].size});
    }else{
        res.json({"total":null,"used":0}); // TODO?
    }
});


function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

module.exports = {
    api: router,

    initDefaults: function(){
        const r = db.prepare("SELECT * FROM users WHERE username = ?").get('admin');
        if (!r){
            this.addUser('admin', 'password', ['admin']);
        }
    },

    addUser: function(username, password, roles){
        
        const salt = generateSalt();
        const pwd = crypto.createHmac('sha512', salt).update(password).digest("base64");
        logger.info(`Adding ${username} user`);
        const info = db.prepare(`INSERT INTO users (username, salt, password) VALUES (?, ?, ?)`).run(username, salt, pwd);

        roles.forEach(role => {
            const r = db.prepare("SELECT id FROM roles WHERE role = ?").get(role);
            if (!r){
                logger.info(`Adding ${role} role`);
                db.prepare("INSERT INTO roles (role) VALUES(?)").run(role);
            }

            const roleId = db.fetchOne("SELECT id FROM roles WHERE role = ?", role)['id'];
            db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(info.lastInsertRowid, roleId);
        });
    }
}
