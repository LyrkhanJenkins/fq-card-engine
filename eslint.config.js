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
                {
                    argsIgnorePattern: "^_", varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_"
                },
            ],
            "no-prototype-builtins": "off",
            "indent": ["error", 4, {"ignoredNodes": ["TemplateLiteral *"]}],
            "quotes": ["error", "double", {"allowTemplateLiterals": true}],
            "semi": ["error", "always"],
            "no-restricted-syntax": [
                "error",
                {
                    "selector": "MemberExpression[object.name='game'][property.name='actors']",
                    "message": "L'accès à game.actors est interdit."
                },
                // Interdit game['actors'] (accès par index)
                {
                    "selector": "MemberExpression[object.name='game'][computed=true][property.type='Literal'][property.value='actors']",
                    "message": "L'accès à game['actors'] est interdit."
                },
                // Interdit game?.actors (optional chaining)
                {
                    "selector": "ChainExpression > MemberExpression[object.name='game'][property.name='actors']",
                    "message": "L'accès à game?.actors est interdit."
                },
                // Interdit game?.['actors']
                {
                    "selector": "ChainExpression > MemberExpression[object.name='game'][computed=true][property.type='Literal'][property.value='actors']",
                    "message": "L'accès à game?.['actors'] est interdit."
                }
            ]
        }
    }
];