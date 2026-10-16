import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../server/app';
import { MemoryRepository } from '../server/store';
const origin = 'http://127.0.0.1:15173';
const runtimes: ReturnType<typeof createApplication>[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
});
function setup() {
  const runtime = createApplication({
    repository: new MemoryRepository(),
    secret: 'test-secret-long-enough-for-tests',
    origin,
  });
  runtimes.push(runtime);
  return runtime;
}
async function client(runtime: ReturnType<typeof createApplication>) {
  const agent = request.agent(runtime.app);
  const r = await agent.get('/api/session');
  return { agent, csrf: r.body.csrf };
}
describe('HTTP authorization boundary', () => {
  it('uses HttpOnly SameSite cookies and never publicly lists rooms', async () => {
    const r = setup();
    const session = await request(r.app).get('/api/session');
    expect(session.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(session.headers['set-cookie'][0]).toContain('SameSite=Strict');
    await request(r.app).get('/api/rooms').expect(401);
  });
  it('rejects write requests with missing CSRF or an unexpected Origin', async () => {
    const r = setup(),
      { agent, csrf } = await client(r),
      body = { nickname: 'host', title: 'movie' };
    await agent.post('/api/rooms').set('Origin', origin).send(body).expect(403);
    await agent
      .post('/api/rooms')
      .set('Origin', 'https://evil.test')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(403);
  });
  it('creates rooms without leaking invites or host sessions in snapshots', async () => {
    const r = setup(),
      { agent, csrf } = await client(r);
    const created = await agent
      .post('/api/rooms')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ nickname: 'host', title: 'movie' })
      .expect(201);
    const snapshot = await agent.get(`/api/rooms/${created.body.room.id}`).expect(200);
    expect(JSON.stringify(snapshot.body)).not.toContain(created.body.invite);
    expect(JSON.stringify(snapshot.body)).not.toContain('inviteHash');
  });
  it('rejects oversized bodies and unknown request fields', async () => {
    const r = setup(),
      host = await client(r);
    await host.agent
      .post('/api/rooms')
      .set('Origin', origin)
      .set('X-CSRF-Token', host.csrf)
      .send({ nickname: 'host', title: 'x', role: 'admin' })
      .expect(400);
    await host.agent
      .post('/api/rooms')
      .set('Origin', origin)
      .set('X-CSRF-Token', host.csrf)
      .send({ nickname: 'x'.repeat(20000), title: 'x' })
      .expect(413);
  });
  it('sets restrictive browser headers', async () => {
    const r = setup();
    const h = await request(r.app).get('/api/health');
    expect(h.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h.headers['referrer-policy']).toBe('no-referrer');
    expect(h.headers['permissions-policy']).toContain('camera=()');
    expect(h.headers['permissions-policy']).toContain('microphone=()');
    expect(h.body.protocolVersion).toBe(2);
  });
  it('does not expose retired media authorization or webhook endpoints', async () => {
    const r = setup(), { agent, csrf } = await client(r);
    for (const path of ['/api/media-token', '/api/livekit/webhook'])
      await agent.post(path).set('Origin', origin).set('X-CSRF-Token', csrf).send({}).expect(404);
  });
});
