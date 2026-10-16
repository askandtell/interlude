export function runtimeConfig(env: NodeJS.ProcessEnv) {
  const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:15173',
    production = env.NODE_ENV === 'production',
    parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password)
    throw new Error('APP_ORIGIN must be an exact origin');
  if (
    production &&
    (!env.SESSION_SECRET ||
      env.SESSION_SECRET.length < 32 ||
      !env.REDIS_URL ||
      parsed.protocol !== 'https:')
  )
    throw new Error('Production requires HTTPS, SESSION_SECRET (32+ chars) and REDIS_URL');
  return { origin, production, host: env.HOST || (env.RENDER ? '0.0.0.0' : '127.0.0.1') };
}
