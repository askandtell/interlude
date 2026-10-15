export function runtimeConfig(env: NodeJS.ProcessEnv) {
  const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:15173';
  const mediaUrl = env.LIVEKIT_URL || 'ws://127.0.0.1:7880';
  const internalUrl =
    env.LIVEKIT_INTERNAL_URL || mediaUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const production = env.NODE_ENV === 'production';
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password)
    throw new Error(
      'APP_ORIGIN must be an exact origin without paths, credentials or trailing slash',
    );
  if (
    production &&
    (!env.SESSION_SECRET ||
      env.SESSION_SECRET.length < 32 ||
      !env.REDIS_URL ||
      parsed.protocol !== 'https:' ||
      !env.LIVEKIT_API_KEY ||
      !env.LIVEKIT_API_SECRET ||
      !mediaUrl.startsWith('wss://'))
  )
    throw new Error(
      'Production requires HTTPS origin, SESSION_SECRET (32+ chars), REDIS_URL and WSS LiveKit credentials',
    );
  return {
    origin,
    mediaUrl,
    internalUrl,
    production,
    host: env.HOST || (env.RENDER ? '0.0.0.0' : '127.0.0.1'),
  };
}
