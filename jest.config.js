/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/test/**/*.test.js'],
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/index.js',
    '!src/deprecated/**/*.js',
    '!src/server/server.js',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageDirectory: 'docs/coverage',
};
