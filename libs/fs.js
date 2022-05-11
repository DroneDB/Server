const util = require('util');
const fs = require('fs');
const mv = require('mv');

const fsExists = util.promisify(fs.exists);
const fsLstat = util.promisify(fs.lstat);
const fsRename = util.promisify(fs.rename);
const fsMove = (oldPath, newPath) => {
    return new Promise((resolve, reject) => {
        mv(oldPath, newPath, err => {
            if (err) reject(err);
            else resolve(newPath);
        });
    });
}
const fsMkdir = util.promisify(fs.mkdir);
const fsRm = util.promisify(fs.rm);
const fsWriteFile = util.promisify(fs.writeFile);
const fsReadFile = util.promisify(fs.readFile);
const fsReaddir = util.promisify(fs.readdir);
const fsStat = util.promisify(fs.stat);

module.exports = {
    fsExists, fsLstat, fsRename, fsMove, fsMkdir, fsRm, fsWriteFile, 
    fsReadFile, fsReaddir, fsStat
};