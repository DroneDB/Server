const config = require('../config');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const os = require('os');
const Mode = require('./Mode');

let storagePath = "";

class Directories{
    static initialize(){
        storagePath = path.resolve(config.storagePath);

        [this.data, this.tmp].forEach(p => {
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        });

        if (Mode.singleDB){
            logger.info(`Serving ddb database: ${storagePath}`);
        }else{
            logger.info(`Using storage path: ${storagePath}`);
        }
    }

    static get data(){
        if (!storagePath) throw new Error("Directories not intialized");

        if (Mode.singleDB) return path.join(os.homedir(), ".ddb-server");
        else return this.storagePath;
    }

    static get storagePath(){
        if (Mode.singleDB) throw new Error("Bug: storagePath should not be accessed in singleDB mode.");
        if (!storagePath) throw new Error("Directories not intialized");
        return storagePath;
    }

    static get singleDBPath(){
        if (!storagePath) throw new Error("Directories not intialized");
        if (!Mode.singleDB) throw new Error("Bug: singleDBPath should not be accessed in non-singleDB mode.");
        return storagePath;
    }

    static get tmp(){
        return path.join(this.data, "tmp")
    }
}

module.exports = Directories;