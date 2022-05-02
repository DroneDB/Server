const logger = require('./logger');
const db = require('./db');
const crypto = require('crypto');
const axios = require('axios');

let provider = null;

class AbstractAuthProvider{
    constructor(){
    }

    // This function should return the user's metadata
    // if login is successful, otherwise raise an error
    async authenticate(username, password){
        throw new Error("Not Implemented");
    }
};


class LocalAuthProvider extends AbstractAuthProvider{
    constructor(){
        super();
        logger.info("Using local DB authentication");
    }

    async authenticate(username, password, token){
        if (token) throw new Error("Token authentication is not available with local auth provider");

        // Authenticate against database
        let r = db.prepare("SELECT salt FROM users WHERE username = ?").get(username);
        if (!r) throw new Error("Unauthorized");

        r = db.prepare("SELECT username, metadata FROM users WHERE username = ? AND password = ?").get(username, crypto.createHmac('sha512', r.salt).update(password).digest("base64"));
        if (!r) throw new Error("Unauthorized");

        let res = { username };
        if (r.metadata){
            for (let k of Object.keys(r.metadata)){
                res[k] = r.metadata[k];
            }
        }
        return res;
    }
};

class RemoteAuthProvider extends AbstractAuthProvider{
    constructor(urlBase){
        super();
        logger.info(`Using remote authentication from ${urlBase}`);

        this.urlBase = urlBase;
        this.timeout = 15000;
    }

    urlFor(url){
        return `${this.urlBase}${url}`
    }

    async authenticate(username, password, token){
        const params = {};
        if (username !== undefined) params.username = username;
        if (password !== undefined) params.password = password;
        if (token !== undefined) params.token = token;

        let response = await axios.post(this.urlFor('/r/auth'), params, { 
            timeout: this.timeout,
            validateStatus: () => true
        });
        if (response.status === 200){
            if (response.data.message || response.data.error){
                throw new Error("Cannot authenticate: " + JSON.stringify(response.data));
            }

            // TODO: update local database with metadata about user
            // for subsequent queries, org tracking, ACLs, etc ?

            return response.data;
        }else if (response.status === 401){
            throw new Error("Unauthorized");
        }else{
            logger.error(`Invalid response from auth endpoint: ${response}`);
            throw new Error("Invalid response from auth endpoint");
        }
    }
};

let providers = {
    'local': LocalAuthProvider,
    'remote': RemoteAuthProvider
};

module.exports = {
    get: function(){
        return provider;
    },
    initialize: function(providerName, ...params){
        provider = new (providers[providerName])(...params);
    }
}