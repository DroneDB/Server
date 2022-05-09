const http = require('http');
const { login } = require('./users');
const { readJwt } = require('./jwt');

function unauthorized(res, realm) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="' + realm + '"');
    res.end('Unauthorized');
};

function error(code, msg){
    var err = new Error(msg || http.STATUS_CODES[code]);
    err.status = code;
    return err;
};

async function readBasicAuth(req, res, next) {
    const realm = 'Authorization Required';
    var authorization = req.headers.authorization;
    
    if (req.user && req.user.username) return next();
    if (!authorization) return unauthorized(res, realm);

    var parts = authorization.split(' ');
    if (parts.length !== 2) return next(error(400));

    var scheme = parts[0]
    , credentials = new Buffer.from(parts[1], 'base64').toString()
    , index = credentials.indexOf(':');

    if ('Basic' != scheme || index < 0) return next(error(400));

    var user = credentials.slice(0, index)
    , pass = credentials.slice(index + 1);

    const userInfo = await login(user, pass);
    req.user = { username: userInfo.username };
    req.token = userInfo.token;
    next();
}

module.exports = {
    basicAuth: [readJwt, readBasicAuth]
};