const js = require('@eslint/js');


module.exports = [

    // Remplacez ces paramètres par ceux que vous souhaitez utiliser
    {
        files: ['**/*.js', '**/*.mjs'],

        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
        },
    },

    // Utiliser les extensions recommandées d'ESLint
    js.configs.recommended,

    // Si vous avez des règles personnalisées, ajoutez-les ici
    {

        rules: {
            'no-undef': 'off',
            'no-unused-vars': [
                'error',
                {argsIgnorePattern: '^_*', varsIgnorePattern: '^_*'},
            ],
            'no-prototype-builtins': 'off',
            'indent': ["error", 4, {"ignoredNodes": ["TemplateLiteral *"]}],
            'quotes': ['error', 'double', { "allowTemplateLiterals": true }],
            'semi': ['error', 'always']
        }
    }
];
