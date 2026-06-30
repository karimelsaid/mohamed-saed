module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'ai/**/*.js',
    '!ai/**/*.test.js',
    '!ai/**/*.spec.js',
    '!ai/base/**',
    '!ai/integration/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js',
    '**/integration/**/*.test.js'
  ],
  verbose: true,
  testTimeout: 30000
};
