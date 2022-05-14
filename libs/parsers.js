const multer = require('multer');
const Directories = require('./Directories');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { safePathJoin } = require('./pathsec');
const path = require('path');
const { asyncHandle } = require('./middleware');
const { fsMkdir, fsMove } = require('./fs');

const uploadRootPath = (req, options) => {
    if (typeof options.destPath === "string") return options.destPath;
    else if (typeof options.destPath === "function") return options.destPath(req);
    else return path.join(Directories.tmp, "uploads");
}

const uploadParser = (field, options = {}) => {
    const chain = [multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                const destPath = uploadRootPath(req, options);

                fs.exists(destPath, exists => {
                    if (!exists) {
                        fs.mkdir(destPath, undefined, () => {
                            cb(null, destPath);
                        });
                    } else {
                        cb(null, destPath);
                    }
                });
            },
            filename: (req, file, cb) => {
                try{
                    const destPath = uploadRootPath(req, options);
                    const filename = uuidv4();

                    req.filePath = safePathJoin(destPath, filename);
                    cb(null, filename);
                }catch(e){
                    cb(e);
                }
            }
        })
    }).single(field), (req, res, next) => {
        if (options.required && !req.filePath){
            throw new Error("Missing file");
        }
        next();
    }];

    if (options.formData){
        chain.push(bodyParser.urlencoded({extended: false}));
    }

    if (options.filePath){
        chain.push(asyncHandle(async (req, res, next) => {
            let filePath = "";
            if (typeof options.filePath === "string") filePath = options.filePath;
            else if (typeof options.filePath === "function") filePath = options.filePath(req);
            
            const destPath = uploadRootPath(req, options);
            const fp = safePathJoin(destPath, filePath);

            // Create parent directories, move file
            await fsMkdir(path.dirname(fp), { recursive: true });
            await fsMove(req.filePath, fp);
            req.filePath = fp;

            next();
        }));
    }

    return chain;
};

module.exports = {
    formDataParser: [multer().none(), bodyParser.urlencoded({extended: false})],
    uploadParser
}
