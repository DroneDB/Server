const path = require('path');

const pathTraversalCheck = (ddbPath, inputPath) => {
    if (path.resolve(ddbPath, inputPath).indexOf(ddbPath) !== 0){
        throw new Error(`Invalid path: ${inputPath}`);
    }
}

const safePathJoin = (knownPath, inputPath) => {
    pathTraversalCheck(knownPath, inputPath);
    return path.join(knownPath, inputPath);
}

module.exports = {
    pathTraversalCheck,
    safePathJoin
};
