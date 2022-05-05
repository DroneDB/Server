const multer = require('multer');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const uploadParser = (field, options = {}) => {
    return [multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                const folderPath = path.join("tmp", "uploads");

                fs.exists(folderPath, exists => {
                    if (!exists) {
                        fs.mkdir(folderPath, undefined, () => {
                            cb(null, folderPath);
                        });
                    } else {
                        cb(null, folderPath);
                    }
                });
            },
            filename: (req, file, cb) => {
                const filename = uuidv4();
                req.filePath = path.join("tmp", "uploads", filename);

                cb(null, filename);
            }
        })
    }).single(field), (req, res, next) => {
        if (options.required && !req.filePath){
            throw new Error("Missing file");
        }
        next();
    }];
};

module.exports = {
    formDataParser: [multer().none(), bodyParser.urlencoded({extended: false})],
    uploadParser
}
