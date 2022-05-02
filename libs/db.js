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
    );`
];

module.exports = {
    initialize: function(){
        // init
        const dbPath = path.join(Directories.data, 'global.db');
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
    prepare: function(...params){
        return this.db.prepare(...params);
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
