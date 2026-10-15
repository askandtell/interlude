import { runtimeConfig } from './config.ts';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { createApplication } from './app.ts';
import { RedisRepository, MemoryRepository } from './store.ts';
import { secret } from './security.ts';
import { MediaService } from './media.ts';
if (existsSync('.env')) loadEnvFile('.env');
const {production,origin,mediaUrl,internalUrl,host}=runtimeConfig(process.env);
const repository = process.env.REDIS_URL ? new RedisRepository(process.env.REDIS_URL) : new MemoryRepository();
if (repository instanceof RedisRepository) await repository.connect();
const media = new MediaService(process.env.LIVEKIT_API_SECRET ? {
  url: mediaUrl, internalUrl,
  key: process.env.LIVEKIT_API_KEY || 'devkey', secret: process.env.LIVEKIT_API_SECRET,
} : undefined);
if (production && (!(await media.ping()) || !(await repository.ping()))) throw new Error('Dependencies unavailable; refusing production startup');
const runtime = createApplication({ repository, media, origin, production, secret: process.env.SESSION_SECRET || secret(48), staticDir: 'build' });
await runtime.rooms.recover();
runtime.http.listen(Number(process.env.PORT || 18080), host, () => {
  console.log(`Interlude control service: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 18080}`);
  if (!process.env.REDIS_URL) console.log('Development memory store; rooms do not survive restart.');
  if (!media.config) console.log('LiveKit is not configured. Room controls work; movie/voice publishing is unavailable.');
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { void runtime.close().finally(() => process.exit(0)); });
