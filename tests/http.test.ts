import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../server/app';
import { MemoryRepository } from '../server/store';
const origin='http://127.0.0.1:15173';
const runtimes:ReturnType<typeof createApplication>[]=[];
afterEach(async()=>{for(const runtime of runtimes.splice(0))await runtime.close();});
function setup(){const runtime=createApplication({repository:new MemoryRepository(),secret:'test-secret-long-enough-for-tests',origin});runtimes.push(runtime);return runtime;}
async function client(runtime:ReturnType<typeof createApplication>){const agent=request.agent(runtime.app);const r=await agent.get('/api/session');return {agent,csrf:r.body.csrf};}
describe('HTTP authorization boundary',()=>{
  it('permits cloud regional signaling only for a configured LiveKit Cloud endpoint',async()=>{
    const {MediaService}=await import('../server/media');
    const runtime=createApplication({repository:new MemoryRepository(),secret:'test-secret-long-enough-for-tests',origin,media:new MediaService({url:'wss://project.livekit.cloud',internalUrl:'https://project.livekit.cloud',key:'test',secret:'test-secret'})});runtimes.push(runtime);
    const response=await request(runtime.app).get('/api/session');
    expect(response.headers['content-security-policy']).toContain('wss://*.livekit.cloud');
    const local=await request(setup().app).get('/api/session');expect(local.headers['content-security-policy']).not.toContain('*.livekit.cloud');
  });
  it('uses HttpOnly SameSite cookies and never publicly lists rooms',async()=>{const r=setup();const session=await request(r.app).get('/api/session');expect(session.headers['set-cookie'][0]).toContain('HttpOnly');expect(session.headers['set-cookie'][0]).toContain('SameSite=Strict');await request(r.app).get('/api/rooms').expect(401);});
  it('rejects write requests with missing CSRF or an unexpected Origin',async()=>{const r=setup(),{agent,csrf}=await client(r),body={nickname:'host',title:'movie'};await agent.post('/api/rooms').set('Origin',origin).send(body).expect(403);await agent.post('/api/rooms').set('Origin','https://evil.test').set('X-CSRF-Token',csrf).send(body).expect(403);});
  it('creates rooms without leaking invites or host sessions in snapshots',async()=>{const r=setup(),{agent,csrf}=await client(r);const created=await agent.post('/api/rooms').set('Origin',origin).set('X-CSRF-Token',csrf).send({nickname:'host',title:'movie'}).expect(201);const snapshot=await agent.get(`/api/rooms/${created.body.room.id}`).expect(200);expect(JSON.stringify(snapshot.body)).not.toContain(created.body.invite);expect(JSON.stringify(snapshot.body)).not.toContain('inviteHash');});
  it('refuses media tokens to pending and unrelated sessions',async()=>{const r=setup(),host=await client(r),guest=await client(r);const c=await host.agent.post('/api/rooms').set('Origin',origin).set('X-CSRF-Token',host.csrf).send({nickname:'host',title:'movie'});const url=`/api/rooms/${c.body.room.id}`;await guest.agent.post(url+'/media-token').set('Origin',origin).set('X-CSRF-Token',guest.csrf).send({}).expect(403);await guest.agent.post(url+'/join').set('Origin',origin).set('X-CSRF-Token',guest.csrf).send({nickname:'guest',invite:c.body.invite}).expect(200);await guest.agent.post(url+'/media-token').set('Origin',origin).set('X-CSRF-Token',guest.csrf).send({}).expect(403);});
  it('returns an explicit unavailable state instead of fake media credentials',async()=>{const r=setup(),host=await client(r);const c=await host.agent.post('/api/rooms').set('Origin',origin).set('X-CSRF-Token',host.csrf).send({nickname:'host',title:'movie'});const m=await host.agent.post(`/api/rooms/${c.body.room.id}/media-token`).set('Origin',origin).set('X-CSRF-Token',host.csrf).send({}).expect(503);expect(m.body.code).toBe('MEDIA_UNAVAILABLE');const h=await request(r.app).get('/api/health');expect(h.body.status).toBe('control-only');});
  it('rejects oversized bodies and unknown request fields',async()=>{const r=setup(),host=await client(r);await host.agent.post('/api/rooms').set('Origin',origin).set('X-CSRF-Token',host.csrf).send({nickname:'host',title:'x',role:'admin'}).expect(400);await host.agent.post('/api/rooms').set('Origin',origin).set('X-CSRF-Token',host.csrf).send({nickname:'x'.repeat(20000),title:'x'}).expect(413);});
  it('sets restrictive browser headers',async()=>{const r=setup();const h=await request(r.app).get('/api/health');expect(h.headers['content-security-policy']).toContain("frame-ancestors 'none'");expect(h.headers['referrer-policy']).toBe('no-referrer');expect(h.headers['permissions-policy']).toContain('camera=()');});
  it('refuses unsigned media webhooks without changing a room',async()=>{const r=setup();await request(r.app).post('/api/livekit/webhook').set('Content-Type','application/webhook+json').send('{"event":"track_published"}').expect(401);});
});
