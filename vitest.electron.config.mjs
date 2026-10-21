import { defineConfig } from 'vitest/config';

// Main-process tests (plain Node, no Electron runtime): `npm run test:electron`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.js'],
  },
});
