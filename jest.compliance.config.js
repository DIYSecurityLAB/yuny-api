const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Compliance Tests',
  testMatch: [
    '<rootDir>/test/compliance/**/*.spec.ts'
  ],
  testTimeout: 120000,
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.ts'
  ]
};