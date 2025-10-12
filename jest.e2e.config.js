const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'E2E Tests',
  testMatch: [
    '<rootDir>/test/e2e/**/*.spec.ts'
  ],
  testTimeout: 120000,
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.ts',
    '<rootDir>/test/e2e-setup.ts'
  ]
};