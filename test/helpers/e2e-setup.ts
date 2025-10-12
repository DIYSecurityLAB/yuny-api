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

// Increase timeout for e2e tests
jest.setTimeout(60000);