const util = require('util');
const fs = require('fs');

const fsExists = util.promisify(fs.exists);
const fsLstat = util.promisify(fs.lstat);
const fsRename = util.promisify(fs.rename);

module.exports = {
    fsExists, fsLstat, fsRename
};