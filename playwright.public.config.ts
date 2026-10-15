import { defineConfig } from '@playwright/test';
import local from './playwright.config';

const origin = process.env.PUBLIC_E2E_URL;
if (!origin || new URL(origin).protocol !== 'https:')
  throw new Error('Set PUBLIC_E2E_URL to the deployed HTTPS origin');
export default defineConfig({
  ...local,
  testMatch: ['public.spec.ts', 'admission.spec.ts'],
  webServer: undefined,
  timeout: 180000,
  expect: { timeout: 30000 },
  use: { ...local.use, baseURL: origin },
});
