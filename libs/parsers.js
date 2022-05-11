const multer = require('multer');
const Directories = require('./Directories');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const uploadPath = (options) => {
    return options.destPath !== undefined ? 
        options.destPath :
        path.join(Directories.tmp, "uploads");
}

const uploadParser = (field, options = {}) => {
    const chain = [multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                const destPath = uploadPath(options);

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
                const destPath = uploadPath(options);

                const filename = uuidv4();
                req.filePath = path.join(destPath, filename);

                cb(null, filename);
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

    return chain;
};

module.exports = {
    formDataParser: [multer().none(), bodyParser.urlencoded({extended: false})],
    uploadParser
}
