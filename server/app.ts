import express, { type ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import helmet from 'helmet';
import { serialize } from 'cookie';
import { Server } from 'socket.io';
import { z } from 'zod';
import path from 'node:path';
import { createSchema, joinSchema, idSchema, envelopeSchema } from '../shared/protocol.ts';
import { Sessions, AppError, RateLimits, hash, equal } from './security.ts';
import { Rooms } from './rooms.ts';
import type { Repository } from './store.ts';
import { MediaService } from './media.ts';
export interface AppOptions { repository: Repository; secret: string; origin: string; production?: boolean; media?: MediaService; staticDir?: string; }
export function createApplication(options: AppOptions) {
  const app = express(), http = createServer(app), sessions = new Sessions(options.secret), limits = new RateLimits();
  const rooms = new Rooms(options.repository), media = options.media ?? new MediaService();
  const mediaOrigin = media.config ? new URL(media.config.url).origin : 'ws://127.0.0.1:7880';
  const mediaOrigins = [mediaOrigin, mediaOrigin.replace(/^ws/, 'http')];
  // Cloud can move signaling to a regional edge after joining. Self-hosted deployments
  // keep their exact origin instead of permitting arbitrary external connections.
  if (mediaOrigin.startsWith('wss://') && new URL(mediaOrigin).hostname.endsWith('.livekit.cloud'))
    mediaOrigins.push('wss://*.livekit.cloud', 'https://*.livekit.cloud');
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'wasm-unsafe-eval'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], workerSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'", ...mediaOrigins], frameAncestors: ["'none'"], objectSrc: ["'none'"],
    upgradeInsecureRequests: options.production ? [] : null,
  } }, referrerPolicy: { policy: 'no-referrer' }, strictTransportSecurity: options.production ? undefined : false }));
  app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()'); if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, _res, next) => { try { limits.take(`ip:${req.socket.remoteAddress}`, 240); next(); } catch (e) { next(e); } });
  app.post('/api/livekit/webhook', express.text({ type: 'application/webhook+json', limit: '64kb' }), async (req, res) => {
    if (typeof req.body !== 'string') throw new AppError('WEBHOOK_AUTH', '无效媒体通知', 401);
    const event = await media.webhook(req.body, req.get('Authorization') || '');
    const name = event.room?.name, identity = event.participant?.identity;
    if (name && identity && (event.event === 'track_published' || event.event === 'participant_joined')) {
      const match = name.match(/^interlude-([\w-]{16,64})-(\d+)$/);
      if (match) {
        try { const room = await rooms.load(match[1]);
          if (Number(match[2]) !== room.transportEpoch || room.closed) await media.remove(name, identity);
          else for (const id of await media.violations(room)) { await media.remove(name, id); await rooms.rejectMedia(room.id, id); }
        } catch (e) { if (e instanceof AppError && e.code === 'ROOM_GONE') await media.retire(name); else throw e; }
      }
    }
    res.status(204).end();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/health', async (_req, res) => { let storage = false; try { storage = await options.repository.ping(); } catch {} const realtime = await media.ping(); res.status(storage ? 200 : 503).json({ status: storage && realtime ? 'ready' : storage ? 'control-only' : 'unavailable', storage, media: realtime }); });
  app.get('/api/session', (req, res) => {
    if (req.get('Sec-Fetch-Site') === 'cross-site') throw new AppError('ORIGIN', '请求来源不受信任', 403);
    const session = sessions.read(req.headers.cookie) || sessions.create();
    res.cookie('interlude', session, { httpOnly: true, secure: !!options.production, sameSite: 'strict', maxAge: 7 * 86400000, path: '/' });
    res.json({ csrf: sessions.csrf(session) });
  });
  app.use('/api', (req, res, next) => {
    try { const session = sessions.read(req.headers.cookie); if (!session) throw new AppError('SESSION', '会话已过期，请刷新页面', 401);
      if (req.method !== 'GET' && (req.get('Origin') !== options.origin || !equal(req.get('X-CSRF-Token') || '', sessions.csrf(session)))) throw new AppError('CSRF', '请求验证失败，请刷新页面', 403);
      res.locals.session = session; next();
    } catch (e) { next(e); }
  });
  app.post('/api/rooms', async (req, res) => { limits.take(`create:${hash(res.locals.session)}`, 5, 3600000); limits.take(`create-ip:${req.socket.remoteAddress}`, 20, 3600000); const data = createSchema.parse(req.body); res.status(201).json(await rooms.create(res.locals.session, data.title, data.nickname)); });
  app.param('id', (_req, _res, next, id) => { try { idSchema.parse(id); next(); } catch (e) { next(e); } });
  app.post('/api/rooms/:id/join', async (req, res) => { limits.take(`join:${hash(res.locals.session)}`, 15); const data = joinSchema.parse(req.body); res.json(await rooms.join(String(req.params.id), res.locals.session, data.invite, data.nickname)); });
  app.get('/api/rooms/:id', async (req, res) => { res.json(await rooms.snapshot(String(req.params.id), res.locals.session)); });
  app.post('/api/rooms/:id/manage', async (req, res) => {
    const data = z.object({ action: z.enum(['approve','deny','kick','transfer','rotate','end']), target: idSchema.optional() }).strict().parse(req.body);
    limits.take(`manage:${hash(res.locals.session)}`, 30); res.json(await rooms.manage(String(req.params.id), res.locals.session, data.action, data.target));
  });
  app.post('/api/rooms/:id/media-token', async (req, res) => {
    limits.take(`media:${hash(res.locals.session)}`, 20);
    res.json(await rooms.transaction(String(req.params.id), async r => { rooms.open(r); const m = rooms.member(r, res.locals.session, true); if (r.retiredRooms.length) throw new AppError('MEDIA_RETIRING', '正在关闭旧媒体连接，完成后才能重新观看', 503); return media.credentials(r, m.id); }));
  });
  app.post('/api/rooms/:id/leave', async (req, res) => { await rooms.presence(String(req.params.id), res.locals.session, false); res.json({ ok: true }); });
  app.use('/api', (_req, res) => { res.status(404).json({ code: 'NOT_FOUND', error: '接口不存在' }); });
  const io = new Server(http, { maxHttpBufferSize: 16 * 1024, transports: ['websocket'], pingInterval: 15000, pingTimeout: 10000,
    allowRequest: (req, done) => done(null, req.headers.origin === options.origin) });
  io.use(async (socket, next) => {
    try { limits.take(`socket-ip:${socket.handshake.address}`, 60); const session = sessions.read(socket.request.headers.cookie);
      if (!session || !equal(socket.handshake.auth.csrf || '', sessions.csrf(session))) throw new AppError('SESSION', '连接身份验证失败', 401);
      const id = idSchema.parse(socket.handshake.auth.roomId); const view = await rooms.snapshot(id, session);
      if (view.closed || view.selfStatus === 'denied') throw new AppError('ROOM_ENDED', '房间已结束或加入申请被拒绝', 403);
      socket.data.session = session; socket.data.roomId = id; socket.data.key = `${id}:${hash(session)}`;
      if ([...io.sockets.sockets.values()].filter(s => s.data.key === socket.data.key).length >= 2) throw new AppError('TOO_MANY_TABS', '同一房间最多打开两个页面', 409);
      next();
    } catch (e) { next(new Error(e instanceof AppError ? e.message : '无法进入房间')); }
  });
  const errorValue = (e: unknown) => e instanceof AppError ? { ok: false, code: e.code, error: e.message } : e instanceof z.ZodError ? { ok: false, code: 'INVALID_INPUT', error: '输入格式不正确' } : { ok: false, code: 'SERVICE_UNAVAILABLE', error: '服务暂时不可用，请稍后再试' };
  rooms.retire = name => media.retire(name);
  rooms.changed = id => { for (const socket of io.sockets.sockets.values()) if (socket.data.roomId === id) {
    void rooms.snapshot(id, socket.data.session).then(view => { socket.emit('snapshot', view); if (view.closed || view.selfStatus === 'denied') socket.disconnect(true); }).catch(() => { socket.emit('revoked'); socket.disconnect(true); });
  } };
  io.on('connection', socket => {
    const { session, roomId, key } = socket.data;
    void rooms.presence(roomId, session, true).catch(() => socket.disconnect(true));
    const handle = (event: string, fn: (data: unknown) => Promise<unknown>) => socket.on(event, async (data: unknown, ack?: (v: unknown) => void) => {
      if (typeof ack !== 'function') return;
      try { limits.take(`events:${key}`, 180); ack({ ok: true, value: await fn(data) }); } catch (e) { ack(errorValue(e)); }
    });
    handle('command', data => { const e = envelopeSchema.parse(data); if (e.roomId !== roomId) throw new AppError('FORBIDDEN', '无法控制其他房间', 403); limits.take(`command:${key}`, 45); return rooms.command(session, e); });
    handle('chat', data => { const input = z.object({ text: z.string().trim().min(1).max(1000) }).strict().parse(data); limits.take(`chat:${key}`, 20); return rooms.message(roomId, session, input.text); });
    handle('pause-request', () => { limits.take(`pause:${key}`, 1, 5000); return rooms.message(roomId, session, '等我一下，想暂停一会儿', true); });
    handle('heartbeat', () => rooms.presence(roomId, session, true));
    socket.on('disconnect', () => { if (![...io.sockets.sockets.values()].some(s => s.data.key === key)) void rooms.presence(roomId, session, false).catch(() => {}); });
  });
  if (options.staticDir) { app.use(express.static(options.staticDir, { index: false, maxAge: '1h' })); app.get(/^\/(?!api(?:\/|$)|socket\.io(?:\/|$)).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.resolve(options.staticDir!, 'index.html')); }); }
  const errors: ErrorRequestHandler = (e, _req, res, _next) => { res.status(e instanceof AppError ? e.status : e instanceof z.ZodError ? 400 : (e as { status?: number }).status === 413 ? 413 : 503).json(errorValue(e)); };
  app.use(errors);
  const sweep = setInterval(() => { void (async () => { await rooms.sweep(); for (const id of await options.repository.ids()) { const room = await rooms.load(id); if (!room.closed && room.members.some(m=>m.online)) { try { for (const memberId of await media.violations(room)) { await media.remove(`interlude-${room.id}-${room.transportEpoch}`, memberId); await rooms.rejectMedia(id, memberId); } } catch { /* SFU down: readiness check exposes it. */ } } } })().catch(() => {}); }, 15000); sweep.unref();
  return { app, http, io, rooms, sessions, async close() { clearInterval(sweep); await new Promise<void>(resolve => io.close(() => resolve())); await options.repository.close(); } };
}
