const multer = require('multer');
const bodyParser = require('body-parser');

module.exports = {
    formDataParser: [multer().none(), bodyParser.urlencoded({extended: false})]
}
