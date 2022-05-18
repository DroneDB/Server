const config = require('../config');
const logger = require('./logger');
const ddb = require('../vendor/ddb');
const { fsReaddir, fsLstat } = require('./fs');
let singleDB = false;

class Mode{
    static get singleDB(){
        return singleDB;
    }

    static get fullServer(){
        return !this.singleDB;
    }

    static async initialize(){
        const { storagePath } = config;

        try{
            if (!(await fsLstat(storagePath)).isDirectory()) throw new Error();
        }catch(e){
            logger.error(`${storagePath} is not a directory?`);
            process.exit(1);
        }

        // Storage path can either be:
        // - A DroneDB database
        // - A directory that either:
        //      - Is empty - or -
        //      - Contains subfolders (one for each organization/project)

        const info = await ddb.info(storagePath, { withHash: false, stoponError: true });
        if (info[0].type === ddb.entry.type.DRONEDB){
            logger.info(`Serving existing ddb database: ${storagePath}`);
            singleDB = true;
        }else if (info[0].type === ddb.entry.type.DIRECTORY){
            // Empty directory or directory containing 
            // 'server.db'? full server mode
            const entries = await fsReaddir(storagePath);
            const emptyDir = entries.length === 0;
            const hasServerDb = entries.find(e => e === 'server.db');

            if ((emptyDir || hasServerDb || config.full) && !config.single){
                logger.info(`Running server using storage path: ${storagePath}`);
            }else{
                // Initialize database
                singleDB = true;

                logger.info(`Initializing ddb database: ${storagePath}`);
                await ddb.init(storagePath);

                logger.info("Building index")
                const entries = await ddb.add(storagePath, ".", { recursive: true }, entry => {
                    logger.info(`${entry.path}`);
                    return true;
                });
                logger.info(`Added ${entries.length} entries`);
                
                logger.info("Building assets")
                
                try{
                    await ddb.build(storagePath, {}, p => {
                        logger.info(`${p}`);
                    });
                }catch(e){
                    logger.error(`Build error: ${e}`);
                }

                await ddb.chattr(storagePath, { public: true });
            }
        }
    }
}

module.exports = Mode;