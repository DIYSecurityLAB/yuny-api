// Integration tests setup
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

beforeAll(async () => {
  // Setup for integration tests
  console.log('Setting up integration tests...');
});

afterAll(async () => {
  // Cleanup for integration tests
  console.log('Cleaning up integration tests...');
});