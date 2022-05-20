const db = require('./db');
const logger = require('./logger');
const express = require('express');
const config = require('../config');
const crypto = require('crypto');
const router = express.Router();
const jwt = require('./jwt');
const Mode = require('./Mode');
const Directories = require('./Directories');
const authProviders = require('./authProviders');
const { formDataParser } = require('./parsers');
const { userAuth, DEFAULT_EXPIRATION_HOURS } = jwt;
const { allowAdmin, allowLoggedIn } = require('./security');
const { asyncHandle } = require('./middleware');
const ddb = require('../vendor/ddb');
const { addOrg } = require('./org');

const userSelectQuery = `SELECT u.username, json_group_array(DISTINCT(r.role)) AS roles,  json_group_array(DISTINCT(o.slug)) AS orgs
                        FROM users u
                        LEFT JOIN (SELECT r.role, ur.user_id FROM user_roles ur
                                    INNER JOIN roles r
                                    ON r.id = ur.role_id) r
                        ON r.user_id = u.id
                        LEFT JOIN (SELECT o.slug, uo.user_id FROM user_orgs uo
                                    INNER JOIN orgs o
                                    ON o.id = uo.org_id) o
                        ON o.user_id = u.id`;

const userToJson = u => {
    return {
        username: u.username,
        roles: JSON.parse(u.roles).filter(r => r != null),
        orgs: JSON.parse(u.orgs).filter(o => o != null)
    };
}

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

const authRequest = async (req, res) => {
    const userInfo = await login(req.body.username, req.body.password, req.body.token);

    res.json({
        username: userInfo.username,
        token: userInfo.token,
        expires: parseInt(((new Date().getTime() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000) / 1000).toFixed(0)),    
    });
};

const getUserRoles = () => {
    return db.prepare("SELECT role FROM roles").all().map(r => r['role']);
};

const addUser = (username, password, roles) => {
    const salt = generateSalt();
    const pwd = crypto.createHmac('sha512', salt).update(password).digest("base64");
    logger.info(`Adding ${username} user`);

    const r = db.prepare(`SELECT username FROM users WHERE username = ?`).get(username);
    if (r) throw new Error(`${username} user already exists`);

    const info = db.prepare(`INSERT INTO users (username, salt, password) VALUES (?, ?, ?)`).run(username, salt, pwd);

    roles.forEach(role => {
        addRole(role);
        const roleId = db.fetchOne("SELECT id FROM roles WHERE role = ?", role)['id'];
        db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(info.lastInsertRowid, roleId);
    });

    addOrg({slug: ddb.Tag.filterComponentChars(username)}, username);
};

const deleteUser = username => {
    if (username === "admin") throw new Error("Cannot delete admin user");

    let r = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
    if (!r) throw new Error("Invalid username");

    logger.info(`Deleting user ${username}`);

    db.prepare(`DELETE FROM users WHERE id = ?`).run(r['id']);
    db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).run(r['id']);
    db.prepare(`DELETE FROM user_orgs WHERE user_id = ?`).run(r['id']);
};

const addRole = role => {
    const r = db.prepare("SELECT id FROM roles WHERE role = ?").get(role);
    if (!r){
        logger.info(`Adding ${role} role`);
        db.prepare("INSERT INTO roles (role) VALUES(?)").run(role);
    }
};

router.post('/users/authenticate', formDataParser, asyncHandle(authRequest));
router.post('/users/authenticate/refresh', userAuth, (req, res) => {
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

router.get('/users/storage', asyncHandle(async (req, res) => {
    if (Mode.singleDB){
        const info = await ddb.info(Directories.singleDBPath, { withHash: false, stoponError: true });
        res.json({"total":null,"used":info[0].size});
    }else{
        res.status(404).send("");
    }
}));

router.get('/users', allowAdmin, asyncHandle(async (req, res) => {
    res.json(db.prepare(userSelectQuery + " GROUP BY (u.id)").all().map(userToJson));
}));

router.delete('/users/:username', allowAdmin, asyncHandle(async (req, res) => {
    deleteUser(req.params.username);
    res.status(204).send("");
}));

router.get('/users/roles', allowLoggedIn, asyncHandle(async (req, res) => {
    res.json(getUserRoles());
}));

router.post('/users', allowAdmin, formDataParser, asyncHandle(async (req, res) => {
    let { username, password, roles } = req.body;
    if (!roles) roles = [];
    else roles = JSON.parse(roles);

    if (!Array.isArray(roles)) throw new Error("Invalid roles");

    const availableRoles = getUserRoles();
    for (let i = 0; i < roles.length; i++){
        if (availableRoles.indexOf(roles[i]) === -1) throw new Error(`Invalid role ${roles[i]}`);
    }

    if (typeof username !== "string" || !username.length) throw new Error("Invalid username");
    if (typeof password !== "string" || !password.length) throw new Error("Invalid password");

    addUser(username, password, roles);
    
    res.json(userToJson(db.prepare(userSelectQuery + ` WHERE u.username = ?`).get(username)));
}));

router.post('/users/changepwd', allowLoggedIn, formDataParser, asyncHandle(async (req, res, next) => {
    const { oldPassword, newPassword } = req.body;

    // Check old password 
    try{
        await authProviders.get().authenticate(req.user.username, oldPassword);
    }catch(e){
        throw new Error("Old password is incorrect");
    }

    // Update
    changePwd(req.user.username, newPassword);
    
    // Pass to authRequest
    req.body.username = req.user.username;
    req.body.password = newPassword;
    req.body.token = null;
    next();
}), asyncHandle(authRequest));


function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function changePwd(username, newPassword){
    const salt = generateSalt();
    const pwd = crypto.createHmac('sha512', salt).update(newPassword).digest("base64");
    logger.info(`Changing password for ${username}`);
    db.prepare(`UPDATE users SET salt = ?, password = ? WHERE username = ?`).run(salt, pwd, username);
    return true;
}

module.exports = {
    api: router,

    login,
    initDefaults: function(){
        const r = db.prepare("SELECT COUNT(id) AS count FROM users").get();
        if (!r['count']){
            addUser('admin', config.defaultAdminPass, ['admin']);
        }
    },

    addUser,
    changePwd,
    addRole,

    getUserId: function(username){
        return db.prepare("SELECT id FROM users WHERE username = ?").get(username)?.['id'];
    }
}
