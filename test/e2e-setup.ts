// E2E tests setup
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

beforeAll(async () => {
  // Setup for E2E tests
  console.log('Setting up E2E tests...');
});

afterAll(async () => {
  // Cleanup for E2E tests
  console.log('Cleaning up E2E tests...');
});