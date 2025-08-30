const js = require("@eslint/js");

module.exports = [
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
        },
    },

    js.configs.recommended,

    {
        rules: {
            "no-undef": "off",
            "no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_*", varsIgnorePattern: "^_*",
                    caughtErrorsIgnorePattern: "^_*" },
            ],
            "no-prototype-builtins": "off",
            "indent": ["error", 4, { "ignoredNodes": ["TemplateLiteral *"] }],
            "quotes": ["error", "double", { "allowTemplateLiterals": true }],
            "semi": ["error", "always"]
        }
    }
];