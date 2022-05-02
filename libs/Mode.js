const config = require('../config');
const fs = require('fs');
const logger = require('./logger');
const ddb = require('../vendor/ddb');

let singleDB = false;
class Mode{
    static get singleDB(){
        return singleDB;
    }

    static async initialize(){
        try{
            if (!fs.lstatSync(config.storagePath).isDirectory()) throw new Error();
        }catch(e){
            logger.error(`${config.storagePath} is not a directory?`);
            process.exit(1);
        }

        // Storage path can either be:
        // - A DroneDB database
        // - A directory that either:
        //      - Is empty - or -
        //      - Contains subfolders (one for each organization/project)

        const info = await ddb.info(config.storagePath, { withHash: false, stoponError: true });
        if (info[0].type === ddb.entry.type.DRONEDB){
            singleDB = true;
        }
    }
}

module.exports = Mode;