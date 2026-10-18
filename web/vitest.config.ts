import { defineConfig } from 'vitest/config';

// Unit tests only (TypeScript, pure logic). The node:test build-output
// checks (test/build.test.mjs) and the Playwright render E2E
// (test/render.e2e.mjs) run under their own runners via npm scripts.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
