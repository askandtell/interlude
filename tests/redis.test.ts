import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RedisRepository } from '../server/store';
import { Rooms } from '../server/rooms';
describe.skipIf(!process.env.REDIS_TEST_URL)('actual Redis repository', () => {
  it('round-trips isolated keys and enforces Redis TTL', async () => {
    const repo = new RedisRepository(process.env.REDIS_TEST_URL!);
    await repo.connect();
    try {
      const id = `test-${randomUUID()}`;
      await repo.set(id, { secret: 'not-logged', nested: { revision: 2 } }, 1);
      expect(await repo.get(id)).toEqual({ secret: 'not-logged', nested: { revision: 2 } });
      expect(await repo.ids()).toContain(id);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await repo.get(id)).toBeUndefined();
      expect(await repo.ping()).toBe(true);
    } finally {
      await repo.close();
    }
  });
  it('recovers room metadata in a fresh service instance without resuming playback', async () => {
    const repo = new RedisRepository(process.env.REDIS_TEST_URL!);
    await repo.connect();
    try {
      const first = new Rooms(repo),
        created = await first.create(randomUUID(), 'Redis test', 'host');
      const hostSession = randomUUID();
      const data = await first.create(hostSession, 'Redis recovery', 'host');
      const second = new Rooms(repo);
      await second.recover();
      const room = await second.snapshot(data.room.id, hostSession);
      expect(room.title).toBe('Redis recovery');
      expect(room.playback.available).toBe(false);
      expect(room.protocolVersion).toBe(2);
      await repo.set(data.room.id, await second.load(data.room.id), 1);
      await repo.set(created.room.id, await second.load(created.room.id), 1);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } finally {
      await repo.close();
    }
  });
});
