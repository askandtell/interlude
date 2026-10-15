import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
const microphone = path.resolve('.cache/fixtures/microphone.wav');
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  expect: { timeout: 12000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:15173',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        ...(existsSync(microphone) ? [`--use-file-for-fake-audio-capture=${microphone}`] : []),
      ],
    },
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:18080/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run ui',
      url: 'http://127.0.0.1:15173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
