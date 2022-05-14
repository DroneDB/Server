const Directories = require('./Directories');
const { fsReaddir, fsStat, fsRm, fsExists } = require('./fs');
const logger = require('./logger');
const path = require('path');
const config = require('../config');

class Background{
    static initialize(){
        setInterval(() => {
            this.cleanupTemporaryDirectory();
        }, 1000 * 60 * 30);

        this.cleanupTemporaryDirectory();
    }

    static async cleanupDirectory(dir, ignore = []){
        try{
            if (!await fsExists(dir)) return;

            const entries = await fsReaddir(dir);
            for (let entry of entries){
                if (ignore.indexOf(entry) !== -1) continue;
    
                let tmpPath = path.join(dir, entry);
        
                let stats = await fsStat(tmpPath);
                const mtime = new Date(stats.mtime);
                if (new Date().getTime() - mtime.getTime() > 1000 * 60 * config.cleanupUploadsAfter){
                    logger.info("Cleaning up " + entry);
                    await fsRm(tmpPath, { recursive: true});
                }
            }
        }catch(e){
            console.log(e.message);
        }
    }

    static async cleanupTemporaryDirectory(){
        this.cleanupDirectory(Directories.tmp, ['uploads']);
        this.cleanupDirectory(path.join(Directories.tmp, "uploads"))
    }
}



module.exports = Background;