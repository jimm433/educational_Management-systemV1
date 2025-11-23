module.exports = {
    parserOptions: {
        ecmaVersion: 2020,
    },
    env: {
        es6: true,
        node: true,
    },
    extends: [
        'google',
    ],
    rules: {
        'indent': ['error', 4],
        'object-curly-spacing': ['error', 'always'],
        'space-before-function-paren': ['error', {
            'anonymous': 'never',
            'named': 'never',
            'asyncArrow': 'always',
        }],
        'require-jsdoc': 'off',
        'max-len': ['error', { code: 120 }],
    },
};

