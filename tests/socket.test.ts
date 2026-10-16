import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../server/app';
import { MemoryRepository } from '../server/store';

const origin = 'http://127.0.0.1:15173';
const runtimes: ReturnType<typeof createApplication>[] = [];
const clients: Socket[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  for (const r of runtimes.splice(0)) await r.close();
});
it('requires the new protocol and provides an authenticated clock and own readiness', async () => {
  const r = createApplication({ repository: new MemoryRepository(), secret: 'socket-test-secret-32-characters-long', origin });
  runtimes.push(r);
  const session = r.sessions.create();
  const created = await r.rooms.create(session, '同步测试', '房主');
  await new Promise<void>((resolve) => r.http.listen(0, '127.0.0.1', resolve));
  const port = (r.http.address() as { port: number }).port;
  const connect = (protocolVersion: number) => {
    const c = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false,
      extraHeaders: { Origin: origin, Cookie: `interlude=${session}` },
      auth: { protocolVersion, roomId: created.room.id, csrf: r.sessions.csrf(session) } });
    clients.push(c);
    return c;
  };
  const old = connect(1);
  const failure = await new Promise<Error>((resolve) => old.once('connect_error', resolve));
  expect(failure.message).toContain('版本已更新');
  const c = connect(2);
  await new Promise<void>((resolve, reject) => { c.once('connect', resolve); c.once('connect_error', reject); });
  const ack = (name: string, data: unknown) => new Promise<any>((resolve, reject) => {
    c.timeout(2000).emit(name, data, (e: Error | null, value: unknown) => e ? reject(e) : resolve(value));
  });
  const sent = Date.now(), clock = await ack('clock', {});
  expect(clock.ok).toBe(true);
  expect(clock.value.serverNow).toBeGreaterThanOrEqual(sent);
  expect(clock.value.serverNow).toBeLessThanOrEqual(Date.now());
  const forged = await ack('viewing', { epoch: created.room.mediaEpoch, state: 'ready', target: 'other' });
  expect(forged.code).toBe('INVALID_INPUT');
});
