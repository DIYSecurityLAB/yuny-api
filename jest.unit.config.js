const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Unit Tests',
  testMatch: [
    '<rootDir>/test/unit/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.(ts|js)',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};