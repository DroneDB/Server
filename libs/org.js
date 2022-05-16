const db = require('./db');
const utils = require('./utils');
const logger = require('./logger');

const addOrg = function(org, owner){
    const slug = org.slug;
    if (slug === undefined) throw new Error("Invalid slug");

    const r = db.prepare("SELECT id FROM orgs WHERE slug = ?").get(slug);
    if (!r){
        const ownerId = db.prepare("SELECT id FROM users WHERE username = ?").get(owner)?.['id'];

        const name = org.name ?? owner;
        const description = org.description;
        const isPublic = org.isPublic ? 1 : 0;

        logger.info(`Adding ${slug} org`);
        db.prepare(`INSERT INTO orgs (slug, name, description, creationDate, owner, isPublic)
        VALUES (?, ?, ?, datetime('now'), ?,  ?)`).run(slug, name, description, ownerId, isPublic);

        const orgId = db.fetchOne("SELECT id FROM orgs WHERE slug = ?", slug)['id'];
        db.prepare("INSERT INTO user_orgs (user_id, org_id) VALUES (?, ?)").run(ownerId, orgId);

        return orgId;
    }
}

const getOrgById = function(id){
    return db.fetchOne("SELECT * FROM orgs WHERE id = ?", id);
};

const getOrg = function(slug){
    return db.fetchOne("SELECT * FROM orgs WHERE slug = ?", slug);
}

const getOrgOwner = function(slug){
    return db.fetchOne(`SELECT u.username FROM users u
        INNER JOIN orgs o ON o.owner = u.id 
        WHERE o.slug = ?`, slug)['username'];
}

const orgToJson = function(orgDb){
    if (!orgDb) return orgDb;
    const o = utils.clone(orgDb);
    o.creationDate = new Date(o.creationDate).toISOString();
    return o;
}

module.exports = {
    addOrg,
    getOrg,
    getOrgById,
    orgToJson,
    getOrgOwner
};