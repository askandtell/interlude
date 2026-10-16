import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { parse } from 'cookie';
export const secret = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class Sessions {
  constructor(
    private key: string,
    private now = Date.now,
  ) {}
  sign(value: string) {
    return createHmac('sha256', this.key).update(value).digest('base64url');
  }
  create() {
    const value = `${this.now()}.${secret()}`;
    return `${value}.${this.sign(value)}`;
  }
  read(cookie?: string) {
    try {
      const token = parse(cookie || '').interlude;
      if (!token) return;
      const parts = token.split('.');
      if (parts.length !== 3) return;
      const timestamp = Number(parts[0]),
        value = parts.slice(0, 2).join('.');
      if (
        !Number.isFinite(timestamp) ||
        timestamp > this.now() ||
        this.now() - timestamp > 7 * 86400000 ||
        !equal(this.sign(value), parts[2])
      )
        return;
      return token;
    } catch {
      return;
    }
  }
  csrf(token: string) {
    return this.sign(`csrf:${token}`);
  }
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export class RateLimits {
  private buckets = new Map<string, { count: number; until: number }>();
  constructor(private now = Date.now) {}
  take(key: string, limit: number, windowMs = 60000) {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + windowMs };
      this.buckets.set(key, bucket);
    }
    if (++bucket.count > limit) throw new AppError('RATE_LIMIT', '操作太频繁，请稍后再试', 429);
    if (this.buckets.size > 5000)
      for (const [id, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(id);
    if (this.buckets.size > 20000) throw new AppError('BUSY', '服务繁忙，请稍后再试', 503);
  }
}
