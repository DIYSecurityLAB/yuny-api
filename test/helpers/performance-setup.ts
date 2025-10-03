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

// Extended timeout for performance tests
jest.setTimeout(300000);