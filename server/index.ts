import { runtimeConfig } from './config.ts';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { createApplication } from './app.ts';
import { RedisRepository, MemoryRepository } from './store.ts';
import { secret } from './security.ts';
if (existsSync('.env')) loadEnvFile('.env');
const { production, origin, host } = runtimeConfig(process.env);
const repository = process.env.REDIS_URL
  ? new RedisRepository(process.env.REDIS_URL)
  : new MemoryRepository();
if (repository instanceof RedisRepository) await repository.connect();
if (production && !(await repository.ping()))
  throw new Error('Storage unavailable; refusing production startup');
const runtime = createApplication({
  repository,
  origin,
  production,
  secret: process.env.SESSION_SECRET || secret(48),
  staticDir: 'build',
});
await runtime.rooms.recover();
runtime.http.listen(Number(process.env.PORT || 18080), host, () => {
  console.log(
    `一起看 control service: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 18080}`,
  );
  if (!process.env.REDIS_URL)
    console.log('Development memory store; rooms do not survive restart.');
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void runtime.close().finally(() => process.exit(0));
  });
