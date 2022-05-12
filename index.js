const fs = require('fs');
const config = require('./config.js');
const packageJson = JSON.parse(fs.readFileSync('./package.json'));
const cookieParser = require('cookie-parser');
const db = require('./libs/db');
const jwt = require('./libs/jwt');

const logger = require('./libs/logger');
const authProviders = require('./libs/authProviders');
const Mode = require('./libs/Mode');
const Directories = require('./libs/Directories');
const Hub = require('./libs/hub');
const Background = require('./libs/background');

const express = require('express');
const app = express();

const share = require('./libs/share');
const ds = require('./libs/ds');
const orgs = require('./libs/orgs');
const users = require('./libs/users');
const push = require('./libs/push');

app.use(cookieParser());

let server;

app.use(Hub.api);
app.use(users.api);
app.use(share.api);
app.use(orgs.api);
app.use(ds.api);
app.use(push.api);

app.use(express.static('vendor/hub/build'));

app.enable('trust proxy');

app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json({error: "Unauthorized"});
    }else{
      logger.error(err.stack);
      res.status(500).json({error: err.message});
    }
});


let gracefulShutdown = () => {
    logger.info("Closing server");
    server.close();
    logger.info("Exiting...");
    process.exit(0);
};

// listen for TERM signal .e.g. kill
process.on('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', gracefulShutdown);

logger.info(`${packageJson.name} ${packageJson.version}`);

let commands = [
    new Promise(async (resolve, reject) => {
        await Mode.initialize();
        Directories.initialize();
        Hub.initialize();
        db.initialize();
        Background.initialize();
        jwt.initialize();
        
        authProviders.initialize(config.auth, config.remoteAuth);

        users.initDefaults();

        if (config.ssl){
            const https = require('https');
            const key  = fs.readFileSync(config.sslKey, 'utf8');
            const cert = fs.readFileSync(config.sslCert, 'utf8');
            logger.info("Using SSL");
            server = https.createServer({ key, cert }, app);
        }else{
            const http = require('http');
            server = http.createServer(app);
        }

        server.listen(config.port, err => {
            if (!err){
                logger.info('Server has started on http://0.0.0.0:' + String(config.port));
                resolve();
            }else reject(err);
        });
    })
];

if (config.powercycle) {
    commands.push(new Promise(() => {
        logger.info("Power cycling is set, application will shut down...");
        process.exit(0);
    }));
}

try{
    Promise.all(commands);
}catch(err){
    logger.error("Error during startup: " + err.message);
    process.exit(1);
}
