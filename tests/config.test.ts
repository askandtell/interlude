import { describe, it, expect } from 'vitest';
import { runtimeConfig } from '../server/config';
describe('synchronization service config', () => {
  const production = {
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(48),
    REDIS_URL: 'redis://private:6379',
    RENDER_EXTERNAL_URL: 'https://app.onrender.com',
  };
  it('starts without media keys', () => {
    expect(runtimeConfig(production)).toMatchObject({
      production: true,
      origin: production.RENDER_EXTERNAL_URL,
    });
  });
  it('rejects insecure origins and missing signing/storage settings', () => {
    for (const env of [
      { ...production, APP_ORIGIN: 'http://unsafe.test' },
      { ...production, SESSION_SECRET: '' },
      { ...production, REDIS_URL: '' },
      { ...production, APP_ORIGIN: 'https://app.test/path' },
    ])
      expect(() => runtimeConfig(env)).toThrow();
  });
  it('keeps local defaults', () => {
    expect(runtimeConfig({}).origin).toBe('http://127.0.0.1:15173');
  });
});
