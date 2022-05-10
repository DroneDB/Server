const config = require('../config');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const os = require('os');
const Mode = require('./Mode');

let storagePath = "";

class Directories{
    static initialize(){
        if (!fs.existsSync(this.data)) fs.mkdirSync(this.data, { recursive: true });

        storagePath = path.resolve(config.storagePath);
        if (Mode.singleDB){
            logger.info(`Serving ddb database: ${storagePath}`);
        }else{
            logger.info(`Using storage path: ${storagePath}`);
        }
    }

    static get data(){
        if (Mode.singleDB) return path.join(os.homedir(), ".ddb-server");
        else return this.storagePath;
    }

    static get storagePath(){
        if (Mode.singleDB) throw new Error("Bug: storagePath should not be accessed in singleDB mode.");
        return storagePath;
    }

    static get singleDBPath(){
        if (!Mode.singleDB) throw new Error("Bug: singleDBPath should not be accessed in non-singleDB mode.");
        return storagePath;
    }
}

module.exports = Directories;