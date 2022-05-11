const formOrQueryParam = (req, param, defaultValue = "") => {
    if (req.query[param] !== undefined) return req.query[param];
    else if (req.body && req.body[param] !== undefined) return req.body[param];
    else return defaultValue;
};

module.exports = {
    formOrQueryParam
}