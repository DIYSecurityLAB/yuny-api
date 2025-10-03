const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Security Tests',
  testMatch: [
    '<rootDir>/test/security/**/*.spec.ts'
  ],
  testTimeout: 120000,
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.ts'
  ]
};