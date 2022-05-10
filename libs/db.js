const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const Directories = require('./Directories');

const migrations = [
    `CREATE TABLE IF NOT EXISTS "users" (
        "id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "username"	TEXT UNIQUE NOT NULL,
        "salt" TEXT NOT NULL,
        "password"	TEXT NOT NULL,
        "metadata"	TEXT NOT NULL DEFAULT "{}"
    );
    
    CREATE TABLE IF NOT EXISTS "config" (
        "key"	TEXT,
        "value"	TEXT,
        PRIMARY KEY("key")
    );
    
    CREATE TABLE IF NOT EXISTS "roles" (
        "id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "role"	TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "user_roles" (
        "id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "user_id"	INTEGER NOT NULL,
        "role_id"	INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_user_roles_user_id
    ON user_roles (user_id);
    CREATE INDEX IF NOT EXISTS ix_user_roles_role_id
    ON user_roles (role_id);
    `
];

module.exports = {
    initialize: function(){
        // init
        const dbPath = path.join(Directories.data, 'server.db');
        let currentMigration = 0;

        this.db = require('better-sqlite3')(dbPath, {});
        if (!this.tableExists("config")){
            currentMigration = 0;
            logger.info(`Initializing global database at ${dbPath}`);
        } else currentMigration = this.getCurrentMigration();

        let i = 0;
        migrations.slice(currentMigration).forEach(m => {
            logger.info(`Migrating (${currentMigration + (i++)})... `);
            this.db.exec(m);
        });
        if (i > 0) this.setCurrentMigration(currentMigration + i);
    },
    tableExists: function(tableName){
        return this.fetchOne(`SELECT COUNT(1) AS count FROM sqlite_master WHERE type='table' AND name = ?;`, tableName)['count'];
    },
    getCurrentMigration: function(){
        return parseInt(this.get("currentMigration"));
    },
    setCurrentMigration: function(i){
        this.set("currentMigration", i);
    },
    fetchOne: function(query, ...params){
        return this.db.prepare(query).get(...params);
    },
    fetchMultiple: function(query, ...params){
        return this.prepare(query).all(...params);
    },
    prepare: function(...params){
        return this.db.prepare(...params);
    },
    exec: function(...params){
        return this.db.exec(...params);
    },
    get: function(key){
        return (this.fetchOne('SELECT value FROM config WHERE key = ?', key) || {}).value;
    },
    set: function(key, value){
    	this.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`).run(key, value);
    },
    setIfNotExists(key, value){
    	if (this.get(key) === undefined){
    		this.set(key, value);
    	}
    }
}
