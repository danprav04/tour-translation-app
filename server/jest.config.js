module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 80,
      lines: 90,
      statements: 85,
    },
  },
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
  ],
};
