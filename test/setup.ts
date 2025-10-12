import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test setup
beforeAll(() => {
  // Any global setup can go here
});

afterAll(() => {
  // Any global cleanup can go here
});