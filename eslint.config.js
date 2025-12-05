const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.mjs', 'scripts/**/*.mjs', 'scripts/apple/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/test/**/*', 'src/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
