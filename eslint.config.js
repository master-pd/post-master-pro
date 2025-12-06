const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-underscore-dangle': 'off',
      'consistent-return': 'off',
      'max-len': ['error', { code: 100, ignoreComments: true }],
      'arrow-body-style': 'off',
      'object-curly-newline': 'off',
      'import/prefer-default-export': 'off',
      'class-methods-use-this': 'off',
      'no-param-reassign': ['error', { props: false }],
      'no-plusplus': 'off',
      'prefer-destructuring': ['error', { object: true, array: false }],
      'no-await-in-loop': 'off',
      'no-continue': 'off',
      'no-restricted-syntax': 'off',
      'no-use-before-define': ['error', { functions: false }],
      'no-shadow': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
        },
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
      ],
    },
  },
];