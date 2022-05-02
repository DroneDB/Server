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

const express = require('express');
const app = express();

const security = require('./libs/security');
const share = require('./libs/share');
const ds = require('./libs/ds');
const orgs = require('./libs/orgs');
const users = require('./libs/users');

app.use(express.static('vendor/hub/build'));
app.use(cookieParser());

let server;

app.use(users.api);
app.use(share.api);
app.use(orgs.api);
app.use(ds.api);

// app.post('/orgs/:org/ds/:ds/list', formDataParser, security.allowDatasetRead, dataset.handleList);

// app.get('/orgs/:org/ds/:ds/download', formDataParser, security.allowDatasetRead, dataset.handleDownload);
// app.get('/orgs/:org/ds/:ds/download/:path*', formDataParser, security.allowDatasetRead, dataset.handleDownload);
// app.post('/orgs/:org/ds/:ds/download', formDataParser, security.allowDatasetRead, dataset.handleDownload);

// app.post('/orgs/:org/ds/:ds/rename', formDataParser, security.allowDatasetOwnerOnly, dataset.handleRename);
// app.get('/orgs/:org/ds/:ds/thumb', formDataParser, security.allowDatasetRead, dataset.handleThumb);
// app.get('/orgs/:org/ds/:ds/tiles/:tz/:tx/:ty.png', formDataParser, security.allowDatasetRead, dataset.handleTile);

// app.post('/orgs/:org/ds/:ds/chattr', formDataParser, security.allowDatasetOwnerOnly, dataset.handleChattr);


// app.get('/orgs/:org/ds/:ds', security.allowDatasetRead, dataset.handleInfo);
// app.delete('/orgs/:org/ds/:ds', security.allowDatasetOwnerOnly, dataset.handleDelete);

const webappRouteHandler = (req, res) => {
    res.sendFile(__dirname + '/vendor/hub/build/index.html');
};

// Not part of official API
app.get('/r/:org?/:ds?', webappRouteHandler);
app.get('/login', webappRouteHandler);
app.get('/upload', webappRouteHandler);
app.get('/', (req, res) => {
    res.redirect(301, '/login');
});

// This is a download entrypoint (not part of spec)
// app.get('/download/:uuid', dataset.handleDownloadFile);

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

// Startup
if (config.test) {
    logger.info("Running in test mode");
}


logger.info(`${packageJson.name} ${packageJson.version}`);

let commands = [
    new Promise(async (resolve, reject) => {
        await Mode.initialize();
        Directories.initialize();
        db.initialize();
        jwt.initialize();
        
        authProviders.initialize(config.auth, config.remoteAuth);

        users.createDefaultUsers();

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
                logger.info('Server has started on port ' + String(config.port));
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
