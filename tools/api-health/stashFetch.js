// Runs before jest.setup.js, which replaces fetch with a no-network stub.
global.__realFetch = global.fetch;
