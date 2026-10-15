import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { Rooms } from '../server/rooms';
import { MemoryRepository } from '../server/store';
import { PeerBroker } from '../server/peers';
import type { PlaybackCommand } from '../shared/protocol';
import { peerSignalSchema } from '../shared/peer';

let rooms: Rooms, id: string, invite: string, now: number;
beforeEach(async () => {
  now = Date.now();
  rooms = new Rooms(new MemoryRepository(), () => now);
  const created = await rooms.create('host', '一起看', '房主');
  id = created.room.id;
  invite = created.invite;
  await rooms.presence(id, 'host', true);
});
async function add(session: string, online = true) {
  const guest = await rooms.join(id, session, invite, session);
  await rooms.manage(id, 'host', 'approve', guest.selfId);
  if (online) await rooms.presence(id, session, true);
  return guest;
}
async function command(value: PlaybackCommand, session = 'host') {
  const r = await rooms.snapshot(id, session);
  return rooms.command(session, {
    id: randomUUID(),
    roomId: id,
    epoch: r.mediaEpoch,
    revision: r.revision,
    command: value,
  });
}
it('defaults to direct without issuing cloud credentials; fourth online member freezes and switches once', async () => {
  await add('g1');
  await add('g2');
  await add('g3', false);
  expect((await rooms.snapshot(id, 'host')).delivery.mode).toBe('direct');
  await command({ kind: 'source', title: 'film', duration: 120 });
  await command({ kind: 'play' });
  now += 2500;
  const before = await rooms.snapshot(id, 'host');
  const switched = await rooms.presence(id, 'g3', true);
  expect(switched.delivery).toMatchObject({ mode: 'relay', reason: 'size', resume: true });
  expect(switched.playback).toMatchObject({ paused: true, position: 2.5, available: false });
  expect(switched.transportEpoch).toBe(before.transportEpoch + 1);
  expect((await rooms.presence(id, 'g3', true)).transportEpoch).toBe(switched.transportEpoch);
});
it('keeps failed direct sticky and restricts retry to a paused host with at most three online', async () => {
  await add('g1');
  let view = await rooms.snapshot(id, 'host');
  view = await rooms.directFailed(id, 'g1', view.transportEpoch, view.mediaEpoch);
  now += 31000;
  await rooms.presence(id, 'host', true);
  expect((await rooms.snapshot(id, 'host')).delivery.mode).toBe('relay');
  await expect(command({ kind: 'retry-direct' }, 'g1')).rejects.toMatchObject({
    code: 'HOST_ONLY',
  });
  await command({ kind: 'source', title: 'film', duration: 120 });
  await command({ kind: 'play' });
  await expect(command({ kind: 'retry-direct' })).rejects.toMatchObject({ code: 'PAUSE_FIRST' });
  await command({ kind: 'pause' });
  view = await command({ kind: 'retry-direct' });
  expect(view.delivery.mode).toBe('direct');
  await expect(
    rooms.directFailed(id, 'g1', view.transportEpoch - 1, view.mediaEpoch),
  ).rejects.toMatchObject({ code: 'STALE_STATE' });
  await add('g2');
  await add('g3');
  await expect(command({ kind: 'retry-direct' })).rejects.toMatchObject({ code: 'TOO_MANY_PEERS' });
});
it('returns from crowd relay only after cooldown while paused', async () => {
  await add('g1');
  await add('g2');
  await add('g3');
  await rooms.presence(id, 'g3', false);
  expect((await rooms.snapshot(id, 'host')).delivery.mode).toBe('relay');
  now += 31000;
  expect((await rooms.presence(id, 'host', true)).delivery.mode).toBe('direct');
});
it('an explicit pause cancels migration resume intent', async () => {
  await command({ kind: 'source', title: 'film', duration: 120 });
  await command({ kind: 'play' });
  const view = await rooms.snapshot(id, 'host');
  expect(
    (await rooms.directFailed(id, 'host', view.transportEpoch, view.mediaEpoch)).delivery.resume,
  ).toBe(true);
  expect((await command({ kind: 'pause' })).delivery.resume).toBe(false);
});
it('direct-only removal never depends on a cloud retirement call', async () => {
  const guest = await add('g1');
  rooms.retire = vi.fn(async () => {
    throw new Error('relay offline');
  });
  await rooms.manage(id, 'host', 'kick', guest.selfId);
  expect(rooms.retire).not.toHaveBeenCalled();
  expect((await rooms.snapshot(id, 'host')).mediaDegraded).toBe(false);
});
it('validates ready membership, target room, epochs, nonce, duplicate tabs and removal before forwarding', async () => {
  const guest = await add('g1'),
    host = await rooms.snapshot(id, 'host');
  const sockets = new Map<string, Socket>();
  const socket = (session: string, socketId: string) => {
    const s = { id: socketId, data: { session, roomId: id }, emit: vi.fn() } as unknown as Socket;
    sockets.set(socketId, s);
    return s;
  };
  const broker = new PeerBroker(rooms, { sockets: { sockets } } as unknown as Server);
  const h = socket('host', 'h'),
    g = socket('g1', 'g'),
    bad = socket('attacker', 'a');
  const envelope = { epoch: host.transportEpoch, mediaEpoch: host.mediaEpoch };
  const hn = randomUUID(),
    gn = randomUUID();
  await expect(broker.join(bad, { ...envelope, nonce: randomUUID() })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await broker.join(h, { ...envelope, nonce: hn });
  await broker.join(g, { ...envelope, nonce: gn });
  await expect(
    broker.join(socket('g1', 'g2'), { ...envelope, nonce: randomUUID() }),
  ).rejects.toMatchObject({ code: 'MEDIA_TAB_IN_USE' });
  const payload = {
    ...envelope,
    target: guest.selfId,
    linkId: [hn, gn].sort().join('/'),
    description: { type: 'offer', sdp: 'v=0' },
  };
  await broker.signal(h, payload);
  expect(g.emit).toHaveBeenCalledWith(
    'peer-signal',
    expect.objectContaining({ from: host.selfId }),
  );
  await expect(broker.signal(h, { ...payload, target: 'x'.repeat(22) })).rejects.toMatchObject({
    code: 'PEER_GONE',
  });
  await expect(broker.signal(h, { ...payload, epoch: 1 })).rejects.toMatchObject({
    code: 'STALE_STATE',
  });
  await expect(
    broker.signal(h, { ...payload, linkId: [randomUUID(), randomUUID()].join('/') }),
  ).rejects.toMatchObject({ code: 'STALE_STATE' });
  expect(
    peerSignalSchema.safeParse({
      ...payload,
      description: { type: 'offer', sdp: 'x'.repeat(12001) },
    }).success,
  ).toBe(false);
  await rooms.manage(id, 'host', 'kick', guest.selfId);
  await expect(broker.signal(g, { ...payload, target: host.selfId })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(broker.fallback(bad, envelope)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
