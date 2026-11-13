import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 120000, // first run downloads a MongoDB binary for mongodb-memory-server
    fileParallelism: false,
    env: { NODE_ENV: 'test', PAYMENT_MODE: 'mock', JWT_SECRET: 'test-secret', SEAT_LOCK_MINUTES: '10' },
  },
});
