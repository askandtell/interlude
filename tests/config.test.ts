import { describe, expect, it } from 'vitest';
import { runtimeConfig } from '../server/config';
describe('free hosted runtime configuration', () => {
  const production = {
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(48),
    REDIS_URL: 'redis://private:6379',
    LIVEKIT_URL: 'wss://project.livekit.cloud',
    LIVEKIT_API_KEY: 'test',
    LIVEKIT_API_SECRET: 'test-secret',
  };
  it('uses the platform HTTPS origin and derives the cloud admin API without a custom domain', () => {
    expect(
      runtimeConfig({
        ...production,
        RENDER: 'true',
        RENDER_EXTERNAL_URL: 'https://interlude.onrender.com',
      }),
    ).toMatchObject({
      origin: 'https://interlude.onrender.com',
      mediaUrl: 'wss://project.livekit.cloud',
      internalUrl: 'https://project.livekit.cloud',
      host: '0.0.0.0',
    });
  });
  it('preserves explicit self-hosted origin and internal endpoint', () => {
    expect(
      runtimeConfig({
        ...production,
        APP_ORIGIN: 'https://cinema.example.com',
        RENDER_EXTERNAL_URL: 'https://unused.onrender.com',
        LIVEKIT_INTERNAL_URL: 'http://livekit:7880',
      }),
    ).toMatchObject({ origin: 'https://cinema.example.com', internalUrl: 'http://livekit:7880' });
  });
  it('keeps loopback development defaults', () => {
    expect(runtimeConfig({})).toMatchObject({
      origin: 'http://127.0.0.1:15173',
      host: '127.0.0.1',
      internalUrl: 'http://127.0.0.1:7880',
    });
  });
  it('refuses insecure production media, missing credentials, or a non-origin URL', () => {
    for (const env of [
      { ...production, APP_ORIGIN: 'https://app.example.com/path' },
      { ...production, APP_ORIGIN: 'https://app.example.com', LIVEKIT_URL: 'ws://localhost:7880' },
      { ...production, APP_ORIGIN: 'https://app.example.com', LIVEKIT_API_KEY: '' },
    ])
      expect(() => runtimeConfig(env)).toThrow();
  });
});
