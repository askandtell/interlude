import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Rooms } from '../server/rooms';
import { MemoryRepository } from '../server/store';
import { correction, targetPosition } from '../src/hooks/useTogetherPlayback';
import { viewingSchema, commandSchema } from '../shared/protocol';
async function fixture() {
  const rooms = new Rooms(new MemoryRepository()),
    c = await rooms.create('owner', '一起看', '房主'),
    g = await rooms.join(c.room.id, 'guest', c.invite, '朋友');
  await rooms.manage(c.room.id, 'owner', 'approve', g.selfId);
  const command = async (command: any) => {
    const v = await rooms.snapshot(c.room.id, 'owner');
    return rooms.command('owner', {
      id: randomUUID(),
      roomId: v.id,
      epoch: v.mediaEpoch,
      revision: v.revision,
      command,
    });
  };
  await command({ kind: 'source', title: '共同影片', duration: 60 });
  return { rooms, id: c.room.id, command };
}
describe('independent playback synchronization', () => {
  it('reports only the callers state and leaves the shared timeline unchanged', async () => {
    const { rooms, id, command } = await fixture();
    await command({ kind: 'play' });
    const before = await rooms.snapshot(id, 'owner');
    const after = await rooms.viewing(id, 'guest', before.mediaEpoch, 'buffering', 60);
    expect(after.playback).toEqual(before.playback);
    expect(after.members.find((m) => m.id === after.selfId)?.viewing).toBe('buffering');
    expect(after.members.find((m) => m.id === after.hostId)?.viewing).toBe('not-ready');
  });
  it('rejects mismatched files, pending users, old epochs and forged report fields', async () => {
    const { rooms, id } = await fixture();
    const v = await rooms.snapshot(id, 'owner');
    await expect(rooms.viewing(id, 'guest', v.mediaEpoch, 'ready', 62)).rejects.toMatchObject({
      code: 'FILE_MISMATCH',
    });
    await expect(rooms.viewing(id, 'guest', v.mediaEpoch - 1, 'ready', 60)).rejects.toMatchObject({
      code: 'STALE_STATE',
    });
    await expect(rooms.viewing(id, 'outsider', v.mediaEpoch, 'ready', 60)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(
      viewingSchema.safeParse({ epoch: 1, state: 'ready', target: 'owner', duration: 60 }).success,
    ).toBe(false);
  });
  it('clears readiness on source changes without transferring files', async () => {
    const { rooms, id, command } = await fixture();
    let v = await rooms.snapshot(id, 'owner');
    await rooms.viewing(id, 'guest', v.mediaEpoch, 'ready', 60);
    v = await command({ kind: 'source', title: '下一部', duration: 100 });
    expect(v.members.every((m) => m.viewing === 'not-ready')).toBe(true);
    expect(v.playback.kind).toBe('local');
  });
  it('keeps paused sources on disconnect and closes legacy rooms during recovery', async () => {
    const { rooms, id, command } = await fixture();
    const before = await rooms.snapshot(id, 'guest');
    await rooms.viewing(id, 'guest', before.mediaEpoch, 'watching', 60);
    await rooms.presence(id, 'guest', false);
    const disconnected = await rooms.snapshot(id, 'guest');
    expect(disconnected.members.find((m) => m.id === disconnected.selfId)?.viewing).toBe('not-ready');
    await command({ kind: 'play' });
    await rooms.presence(id, 'owner', false);
    expect((await rooms.snapshot(id, 'owner')).playback.paused).toBe(true);
    await rooms.transaction(id, (r) => {
      (r as any).protocolVersion = undefined;
    });
    await rooms.recover();
    expect((await rooms.snapshot(id, 'owner')).closed).toBe(true);
  });
  it('does not accept removed streaming commands', () => {
    expect(commandSchema.safeParse({ kind: 'use-relay' }).success).toBe(false);
    expect(commandSchema.safeParse({ kind: 'retry-direct' }).success).toBe(false);
  });
  it('uses bounded drift correction and a paused authoritative timeline', async () => {
    expect(correction(0.1)).toBe(1);
    expect(correction(0.3)).toBe(1.03);
    expect(correction(-0.3)).toBe(0.97);
    expect(correction(0.6)).toBe('seek');
    const { rooms, id } = await fixture();
    const v = await rooms.snapshot(id, 'owner');
    expect(targetPosition(v, v.serverNow + 5000)).toBe(0);
  });
});
