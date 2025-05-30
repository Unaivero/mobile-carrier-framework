// Test setup file
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.WS_PORT = '0';
process.env.DATABASE_URL = ':memory:'; // Use in-memory database for tests

// Mock external services to prevent actual network calls during tests
jest.setTimeout(10000);

// Global test teardown
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 100));
});
