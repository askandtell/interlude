import Redis from 'ioredis';
export interface Repository {
  get<T>(id: string): Promise<T | undefined>;
  set(id: string, value: unknown, ttlSeconds: number): Promise<void>;
  ids(): Promise<string[]>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
export class MemoryRepository implements Repository {
  private items = new Map<string, { json: string; until: number }>();
  async get<T>(id: string) {
    const v = this.items.get(id);
    if (!v || v.until < Date.now()) {
      this.items.delete(id);
      return;
    }
    return JSON.parse(v.json) as T;
  }
  async set(id: string, value: unknown, ttl: number) {
    this.items.set(id, { json: JSON.stringify(value), until: Date.now() + ttl * 1000 });
  }
  async ids() {
    return [...this.items.keys()];
  }
  async ping() {
    return true;
  }
  async close() {
    this.items.clear();
  }
}
export class RedisRepository implements Repository {
  private redis: Redis;
  constructor(url: string) {
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.redis.on('error', () => {});
  }
  async connect() {
    await this.redis.connect();
  }
  async get<T>(id: string) {
    const value = await this.redis.get(`interlude:room:${id}`);
    return value ? (JSON.parse(value) as T) : undefined;
  }
  async set(id: string, value: unknown, ttl: number) {
    await this.redis.set(`interlude:room:${id}`, JSON.stringify(value), 'EX', ttl);
  }
  async ids() {
    let cursor = '0';
    const ids: string[] = [];
    do {
      const result = await this.redis.scan(cursor, 'MATCH', 'interlude:room:*', 'COUNT', 100);
      cursor = result[0];
      ids.push(...result[1].map((key) => key.slice('interlude:room:'.length)));
    } while (cursor !== '0');
    return ids;
  }
  async ping() {
    return (await this.redis.ping()) === 'PONG';
  }
  async close() {
    await this.redis.quit();
  }
}
