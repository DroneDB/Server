const { fsCreationDate, fsExists, fsReadFile, fsWriteFile, fsIsDirectory } = require('./fs');
const path = require('path');
const ddb = require('../vendor/ddb');

async function getOrgFromDDBInfo(ddbInfo){
    const info = ddbInfo[0];
    if (info.type !== ddb.entry.type.DRONEDB) throw new Error(`${JSON.stringify(ddbInfo)} is not a DroneDB entry`);

    return {
        name: info.properties?.meta?.name?.data ?? path.basename(info.path),
        description:  info.properties?.meta?.description?.data ?? "",
        creationDate: (await fsCreationDate(info.path.replace("file://", ""))).toISOString(),
        isPublic: !!info.properties.public,
        owner: info.properties?.meta?.owner?.data ?? null
    };
}

async function orgInfoFromPath(p){
    if (!await fsIsDirectory(p)) throw new Error(`${p} is not a directory`);

    let info = await ddb.info(p);
    if (info[0].type !== ddb.entry.type.DRONEDB){
        // Make it so
        await ddb.init(p);
        info = await ddb.info(p);
    }

    return await getOrgFromDDBInfo(info);
}

module.exports = {
    orgInfoFromPath
};
