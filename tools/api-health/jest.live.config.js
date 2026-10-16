const base = require('../../jest.config.js');
module.exports = {
  ...base,
  rootDir: '../..',
  setupFiles: [...(base.setupFiles || []), '<rootDir>/tools/api-health/stashFetch.js'],
  testMatch: ['<rootDir>/tools/api-health/*.live.ts'],
  testTimeout: 120000,
};
