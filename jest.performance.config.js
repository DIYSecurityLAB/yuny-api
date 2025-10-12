const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Performance Tests',
  testMatch: [
    '<rootDir>/test/performance/**/*.spec.ts'
  ],
  testTimeout: 300000, // 5 minutes for performance tests
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.ts'
  ]
};