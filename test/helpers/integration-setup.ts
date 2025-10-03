import { TestHelper } from './test-helper';

beforeAll(async () => {
  await TestHelper.createTestApp();
});

beforeEach(async () => {
  await TestHelper.cleanDatabase();
});

afterAll(async () => {
  await TestHelper.closeTestApp();
});

// Increase timeout for integration tests
jest.setTimeout(30000);