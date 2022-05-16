'use strict';

let fs = require('fs');
let os = require('os');
let argv = require('minimist')(process.argv.slice(2));
let utils = require('./libs/utils');

if (argv.help){
	console.log(`
Usage: node index.js [storage-path] [options]

Options:
	--storage-path	Path to the storage folder or individual DroneDB database (default: .)
	--config <path>	Path to the configuration file (default: none)	
	-p, --port <number> 	Port to bind the server to (default: 3000)
	--hub-name <name> 	Name of the server (default: machine's hostname)
	--hub-icon <icon>	Icon to use in the UI's header. Can be one of https://semantic-ui.com/elements/icon.html. (default: "dronedb")
	--hub-logo <path>	Path to image (SVG, PNG or JPEG) to use as a logo (default: none)
	--log-level <logLevel>	Set log level verbosity (default: info)
	-a, --auth <provider>	Authentication provider to use. [local|remote] (default: local)
	--remote-auth <url>	Remote authentication URL. (default: https://dronedb.app)
	--ssl-cert	Path to cert for SSL. (default: none)
	--ssl-key	Path to key for SSL. (default: none)
	--cleanup-uploads-after <number> Number of minutes that elapse before deleting unfinished uploads. Set this value to the maximum time you expect a dataset to be uploaded. (default: 2880) 
	--single	Serve only the directory specified by storage-path, even if it's empty. (default: run server when storage path is an empty directory)
	--full	Serve in full server mode from storage-path even if it's not empty. (default: run server when storage path is an empty directory)
	--powercycle	When set, the application exits immediately after powering up. Useful for testing launch and compilation issues.
Log Levels: 
error | debug | info | verbose | debug | silly 
`);
	process.exit(0);
}

let config = {};

// Read configuration from file
let configFilePath = argv.config || "config-default.json";
let configFile = {};

if (/\.json$/i.test(configFilePath) && fs.existsSync(configFilePath)){
	try{
		let data = fs.readFileSync(configFilePath);
		configFile = JSON.parse(data.toString());
	}catch(e){
		console.log(`Invalid configuration file ${configFilePath}`);
		process.exit(1);
	}
}

// Gets a property that might not exist from configuration file
// example: fromConfigFile("logger.maxFileSize", 1000);
function fromConfigFile(prop, defaultValue){
	return utils.get(configFile, prop, defaultValue);
}

// Logging configuration
config.logger = {};
config.logger.level = argv.log_level || fromConfigFile("logger.level", 'info'); // What level to log at; info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
config.logger.maxFileSize = fromConfigFile("logger.maxFileSize", 1024 * 1024 * 100); // Max file size in bytes of each log file; default 100MB
config.logger.maxFiles = fromConfigFile("logger.maxFiles", 10); // Max number of log files kept
config.logger.logDirectory = fromConfigFile("logger.logDirectory", ''); // Set this to a full path to a directory - if not set logs will be written to the application directory.

config.storagePath = (argv._.length ? argv._[0] : "") || argv.storagePath || argv.s || fromConfigFile("storagePath", process.env.STORAGE_PATH || ".");
config.port = parseInt(argv.port || argv.p || fromConfigFile("port", process.env.PORT || 5000));
config.hub = {
    name: argv['hub-name'] || fromConfigFile("hub-name", process.env.HUB_NAME || os.hostname()),
    icon: argv['hub-icon'] || fromConfigFile("hub-icon", process.env.HUB_ICON || "dronedb"),
    logo: argv['hub-logo'] || fromConfigFile("hub-logo", process.env.HUB_LOGO || ""),
};
config.cleanupUploadsAfter = parseInt(argv['cleanup-uploads-after'] || fromConfigFile("cleanupUploadsAfter", 2880));
config.auth = argv.auth || argv.a || fromConfigFile("auth", "local");
config.remoteAuth = argv['remote-auth'] || fromConfigFile("remote-auth", "https://dronedb.app");
config.sslCert = argv['ssl-cert'] || fromConfigFile("ssl-cert", "");
config.sslKey = argv['ssl-key'] || fromConfigFile("ssl-key", "");
config.ssl = config.sslCert && config.sslKey;
config.single = argv.single || fromConfigFile("single", false);
config.full = argv.full || fromConfigFile("full", false);
config.powercycle = argv.powercycle || fromConfigFile("powercycle", false);

module.exports = config;
