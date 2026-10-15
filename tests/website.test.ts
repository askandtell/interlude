import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { websiteSource } from '../shared/website';
import { commandSchema } from '../shared/protocol';
import { Rooms } from '../server/rooms';
import { MemoryRepository } from '../server/store';

describe('official watch links and room authority', () => {
  it('canonicalizes four platforms and removes credentials in query and tracking fragments', () => {
    expect(
      websiteSource('https://bilibili.com/video/BV123abc/?p=2&access_token=secret#secret'),
    ).toEqual({ provider: '哔哩哔哩', url: 'https://www.bilibili.com/video/BV123abc/?p=2' });
    for (const url of [
      'https://v.youku.com/v_show/id_XNjEy=.html',
      'https://www.iqiyi.com/v_123abc.html',
      'https://v.qq.com/x/cover/abc/def.html',
      'https://v.qq.com/x/page/abc.html',
    ])
      expect(websiteSource(url).url).toBe(url);
  });
  it('rejects arbitrary fetch targets, login pages, shortlinks, ports, credentials and URL tricks', () => {
    for (const url of [
      'http://www.bilibili.com/video/BV123/',
      'https://www.bilibili.com.evil.test/video/BV123/',
      'https://user:pass@v.qq.com/x/page/abc.html',
      'https://v.qq.com:8443/x/page/abc.html',
      'https://b23.tv/abc',
      'https://www.iqiyi.com/login',
      'javascript:alert(1)',
      'https://127.0.0.1/video',
      'https://v.qq.com/x/page/a.html/../../login',
    ]) {
      expect(() => websiteSource(url)).toThrow();
      expect(commandSchema.safeParse({ kind: 'website', url }).success).toBe(false);
    }
  });
  it('keeps websites private, rejects guest control, advances authoritative time and clears URL on local replacement', async () => {
    let now = Date.now();
    const rooms = new Rooms(new MemoryRepository(), () => now);
    const { room, invite } = await rooms.create('host', 'film', '房主');
    async function command(c: unknown, session = 'host') {
      const r = await rooms.snapshot(room.id, session);
      return rooms.command(session, {
        id: randomUUID(),
        roomId: room.id,
        epoch: r.mediaEpoch,
        revision: r.revision,
        command: commandSchema.parse(c),
      });
    }
    const selected = await command({
      kind: 'website',
      url: 'https://www.iqiyi.com/v_123.html?token=private',
    });
    expect(selected.playback.website?.url).toBe('https://www.iqiyi.com/v_123.html');
    expect((await rooms.join(room.id, 'guest', invite, '朋友')).playback.website).toBeUndefined();
    const guest = await rooms.snapshot(room.id, 'guest');
    await rooms.manage(room.id, 'host', 'approve', guest.selfId);
    await expect(command({ kind: 'play' }, 'guest')).rejects.toMatchObject({ code: 'HOST_ONLY' });
    await command({ kind: 'play' });
    now += 5000;
    expect((await command({ kind: 'pause' })).playback.position).toBe(5);
    const local = await command({ kind: 'source', title: 'local.mp4', duration: 60 });
    expect(local.playback.website).toBeUndefined();
    expect(local.mediaEpoch).toBeGreaterThan(selected.mediaEpoch);
  });
});

describe('extension trust boundary', () => {
  it('accepts snapshots only from paired room, refuses stale epochs, and exposes state only to paired player', async () => {
    const state: Record<string, any> = { pair: { roomTab: 10, roomId: 'room-id', videoTab: 20 } };
    let listener: any;
    const chrome = {
      runtime: {
        getURL: (p: string) => 'chrome-extension://test/' + p,
        onMessage: {
          addListener: (f: any) => {
            listener = f;
          },
        },
      },
      storage: {
        session: {
          get: async () => structuredClone(state),
          set: async (v: any) => Object.assign(state, v),
          clear: async () => {
            for (const k of Object.keys(state)) delete state[k];
          },
        },
      },
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        sendMessage: async () => {},
      },
    };
    runInNewContext(readFileSync('extensions/watch-sync/worker.js', 'utf8'), {
      chrome,
      URL,
      Date,
      Set,
    });
    const send = (m: any, id: number) =>
      new Promise<any>((resolve) => listener(m, { tab: { id } }, resolve));
    const snapshot = {
      roomId: 'room-id',
      epoch: 2,
      revision: 3,
      url: 'https://www.iqiyi.com/v_123.html',
      position: 12,
      paused: true,
    };
    await send({ type: 'snapshot', snapshot }, 99);
    expect(state.snapshot).toBeUndefined();
    await send({ type: 'snapshot', snapshot }, 10);
    expect(state.snapshot.epoch).toBe(2);
    await send({ type: 'snapshot', snapshot: { ...snapshot, epoch: 1, revision: 100 } }, 10);
    expect(state.snapshot.epoch).toBe(2);
    expect((await send({ type: 'poll' }, 99)).snapshot).toBeUndefined();
    expect((await send({ type: 'poll' }, 20)).snapshot.position).toBe(12);
    state.received = Date.now() - 6000;
    expect((await send({ type: 'poll' }, 20)).snapshot).toBeNull();
    await send({ type: 'disconnect' }, 99);
    expect(state.pair).toBeDefined();
    await send({ type: 'snapshot', snapshot: null }, 10);
    expect(state.snapshot).toBeNull();
  });
});
