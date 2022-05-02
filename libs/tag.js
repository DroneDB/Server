const { v4: uuidv4 } = require('uuid');

const PUBLIC_ORG_NAME = "public";
const TagComponentInvalidChars = /[^A-Za-z0-9_-]/g;

module.exports = {
    PUBLIC_ORG_NAME,
    parseOrCreateTag: function(tag){
        if (!tag){
            return {
                organization: PUBLIC_ORG_NAME,
                dataset: uuidv4().replace(/-/g, '')
            };
        }else{
            const parts = tag.split('/');
            let t;

            // TODO: check for invalid characters?
            if (parts.length === 1){
                t = {
                    organization: PUBLIC_ORG_NAME,
                    dataset: parts[0]
                };
            }else{
                t = {
                    organization: parts[parts.length - 2],
                    dataset: parts[parts.length - 1]
                };
            }

            if (t.dataset.trim() === ""){
                t.dataset = uuidv4().replace(/-/g, ''); // Generate one
            }

            return t;
        }
    },

    dump: function(tag){
        return `${tag.organization}/${tag.dataset}`;
    },

    filterComponentChars: function(input){
        return input.replace(TagComponentInvalidChars, "");
    }
};