const Mode = require('./Mode');
const Directories = require('./Directories');
const fs = require('fs');
const config = require('../config');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { noCache } = require('./middleware');
const router = express.Router();

class Hub{
    static initialize(){
        let index = fs.readFileSync(path.join(__dirname, "..", "vendor", "hub", "build", "index.html"), "utf8");
        let logoPath = null;

        if (config.hub.logo && 
                ['.png', '.jpg', '.jpeg', '.svg'].indexOf(path.extname(config.hub.logo.toLowerCase())) !== -1 &&
                fs.existsSync(config.hub.logo)) {
            logoPath = `/images/logo${path.extname(config.hub.logo)}`;
            router.get(logoPath, (req, res) => {
                res.sendFile(path.resolve(config.hub.logo));
            });
        }

        let indexEtag = "";
        
        let opts = [
            `appName: "${config.hub.name}"`,
            `appIcon: "${config.hub.icon}"`,
        ];

        if (logoPath){
            opts.push(`appLogo: "${logoPath}"`);
        }

        if (Mode.singleDB){
            opts = opts.concat([
                `readOnlyOrgs: true`,
                `singleOrganization: "projects"`,
                `disableDatasetCreation: true`,
                `disableDatasetDeletion: true`
            ]);
        }else{
            opts = opts.concat([
                `disableStorageInfo: true`
            ]);
        }

        opts.push(`enableUsersManagement: true`);
        
        index = index.replace("// #HUB OPTIONS#", opts.join(","));
        indexEtag = crypto.createHash('md5').update(index, 'utf8').digest('hex');
        
        const handler = (req, res) => {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Length', index.length);
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.setHeader('ETag', indexEtag);
            res.send(index);
        };
        router.get('/r', handler);
        router.get('/r/*', handler);
        router.get('/login', handler);

        router.get('/', noCache, (req, res) => {
            if (Mode.singleDB){
                res.redirect(301, `/r/projects/${path.basename(Directories.singleDBPath)}`);
            }else{
                res.redirect(301, '/login');
            }
        });
        
        if (!Mode.singleDB){
            router.get('/upload', handler);
        }
    }

    static get api(){
        return router;
    }
}

module.exports = Hub;