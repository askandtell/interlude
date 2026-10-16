import { websiteSource } from '../shared/website';
import { randomUUID } from 'node:crypto';
import type { Repository } from './store.ts';
import { AppError, equal, hash, secret } from './security.ts';
import type {
  ChatMessage,
  CommandEnvelope,
  MemberView,
  PlaybackState,
  RoomView,
} from '../shared/protocol.ts';
interface Member extends MemberView {
  session: string;
  lastSeen: number;
}
export interface RoomRecord {
  id: string;
  title: string;
  createdAt: number;
  hostId: string;
  revision: number;
  mediaEpoch: number;
  closed: boolean;
  inviteHash: string;
  inviteUntil: number;
  members: Member[];
  playback: PlaybackState;
  chat: ChatMessage[];
  seen: { id: string; at: number }[];
  hostOfflineAt?: number;
  emptySince?: number;
  protocolVersion: 2;
}
const DAY = 86400000;
export class Rooms {
  private locks = new Map<string, Promise<unknown>>();
  changed: (id: string) => void = () => {};
  constructor(
    public repository: Repository,
    public now = Date.now,
  ) {}
  async transaction<T>(
    id: string,
    fn: (room: RoomRecord) => T | Promise<T>,
    write = true,
  ): Promise<T> {
    const previous = this.locks.get(id) || Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        const room = await this.load(id);
        const result = await fn(room);
        if (write) {
          await this.save(room);
          this.changed(id);
        }
        return result;
      });
    this.locks.set(id, work);
    try {
      return await work;
    } finally {
      if (this.locks.get(id) === work) this.locks.delete(id);
    }
  }
  async load(id: string) {
    const r = await this.repository.get<RoomRecord>(id);
    if (!r || this.now() - r.createdAt >= DAY)
      throw new AppError('ROOM_GONE', '房间不存在或已经过期', 404);
    return r;
  }
  async save(r: RoomRecord) {
    await this.repository.set(
      r.id,
      r,
      Math.max(1, Math.ceil((r.createdAt + DAY - this.now()) / 1000)),
    );
  }
  member(r: RoomRecord, session: string, approved = false) {
    const m = r.members.find((m) => equal(m.session, hash(session)));
    if (!m || m.status === 'banned' || (approved && m.status !== 'approved'))
      throw new AppError('FORBIDDEN', '你尚未获准进入这个房间', 403);
    return m;
  }
  owner(r: RoomRecord, session: string) {
    const m = this.member(r, session, true);
    if (m.id !== r.hostId) throw new AppError('HOST_ONLY', '只有房主可以执行此操作', 403);
    return m;
  }
  open(r: RoomRecord) {
    if (r.closed) throw new AppError('ROOM_ENDED', '这场放映已经结束', 410);
  }
  async create(session: string, title: string, nickname: string) {
    const now = this.now(),
      invite = secret();
    const member: Member = {
      id: secret(16),
      session: hash(session),
      nickname,
      status: 'approved',
      viewing: 'not-ready',
      online: false,
      lastSeen: now,
    };
    const r: RoomRecord = {
      id: secret(16),
      title,
      createdAt: now,
      hostId: member.id,
      revision: 0,
      mediaEpoch: 0,
      protocolVersion: 2,
      closed: false,
      inviteHash: hash(invite),
      inviteUntil: now + 7200000,
      members: [member],
      chat: [],
      seen: [],
      emptySince: now,
      hostOfflineAt: now,
      playback: {
        kind: 'none',
        title: '',
        duration: 0,
        position: 0,
        paused: true,
        updatedAt: now,
        available: false,
      },
    };
    await this.save(r);
    return { room: this.view(r, session), invite };
  }
  async join(id: string, session: string, invite: string, nickname: string) {
    return this.transaction(id, (r) => {
      this.open(r);
      const existing = r.members.find((m) => m.session === hash(session));
      if (existing) {
        if (existing.status === 'banned' || existing.status === 'denied')
          throw new AppError('FORBIDDEN', '加入申请未获通过', 403);
        return this.view(r, session);
      }
      if (this.now() > r.inviteUntil || !equal(hash(invite), r.inviteHash))
        throw new AppError('INVITE_EXPIRED', '邀请已失效，请联系房主获取新邀请', 403);
      if (r.members.filter((m) => m.status === 'pending').length >= 16 || r.members.length >= 64)
        throw new AppError('QUEUE_FULL', '等待人数已满', 409);
      r.members.push({
        id: secret(16),
        session: hash(session),
        nickname,
        status: 'pending',
        viewing: 'not-ready',
        online: false,
        lastSeen: this.now(),
      });
      r.revision++;
      return this.view(r, session);
    });
  }
  view(r: RoomRecord, session: string): RoomView {
    const me = this.member(r, session);
    const approved = me.status === 'approved';
    const visible = (m: Member): MemberView => ({
      id: m.id,
      nickname: m.nickname,
      status: m.status,
      viewing: m.viewing || 'not-ready',
      online: m.online && this.now() - m.lastSeen < 45000,
    });
    const offline = r.hostOfflineAt === undefined ? 0 : this.now() - r.hostOfflineAt;
    return {
      id: r.id,
      title: r.title,
      selfId: me.id,
      selfStatus: me.status,
      hostId: r.hostId,
      revision: r.revision,
      protocolVersion: 2,
      mediaEpoch: r.mediaEpoch,
      closed: r.closed,
      createdAt: r.createdAt,
      hostState: !offline ? 'online' : offline < 60000 ? 'reconnecting' : 'waiting',
      serverNow: this.now(),
      members: approved ? r.members.filter((m) => m.status === 'approved').map(visible) : [],
      pending:
        approved && me.id === r.hostId
          ? r.members.filter((m) => m.status === 'pending').map(visible)
          : [],
      chat: approved ? r.chat : [],
      playback: approved
        ? { ...r.playback }
        : {
            kind: 'none',
            title: '',
            position: 0,
            duration: 0,
            paused: true,
            available: false,
            updatedAt: this.now(),
          },
    };
  }
  async snapshot(id: string, session: string) {
    return this.view(await this.load(id), session);
  }
  async presence(id: string, session: string, online: boolean) {
    return this.transaction(id, (r) => {
      const m = this.member(r, session);
      m.online = online;
      if (!online) m.viewing = 'not-ready';
      m.lastSeen = this.now();
      if (m.id === r.hostId) {
        if (online) r.hostOfflineAt = undefined;
        else {
          r.hostOfflineAt ??= this.now();
          this.freeze(r);
        }
      }
      const anyOnline = r.members.some(
        (m) => m.online && m.status === 'approved' && this.now() - m.lastSeen < 45000,
      );
      r.emptySince = anyOnline ? undefined : (r.emptySince ?? this.now());
      return this.view(r, session);
    });
  }
  freeze(r: RoomRecord) {
    if (!r.playback.paused)
      r.playback.position = Math.min(
        r.playback.duration,
        r.playback.position + (this.now() - r.playback.updatedAt) / 1000,
      );
    r.playback.paused = true;
    r.playback.updatedAt = this.now();
    r.revision++;
  }
  async manage(
    id: string,
    session: string,
    action: 'approve' | 'deny' | 'kick' | 'transfer' | 'rotate' | 'end',
    target?: string,
  ) {
    const result = await this.transaction(id, (r) => {
      this.open(r);
      this.owner(r, session);
      let invite: string | undefined;
      const m = r.members.find((m) => m.id === target);
      if (['approve', 'deny', 'kick', 'transfer'].includes(action) && (!m || m.id === r.hostId))
        throw new AppError('INVALID_MEMBER', '无法对该成员执行此操作');
      if (action === 'approve') {
        if (m!.status !== 'pending') throw new AppError('INVALID_MEMBER', '该申请已处理');
        if (r.members.filter((m) => m.status === 'approved').length >= 8)
          throw new AppError('ROOM_FULL', '房间最多容纳 8 人', 409);
        m!.status = 'approved';
      }
      if (action === 'deny') {
        if (m!.status !== 'pending') throw new AppError('INVALID_MEMBER', '该申请已处理');
        m!.status = 'denied';
      }
      if (action === 'kick') {
        if (m!.status !== 'approved') throw new AppError('INVALID_MEMBER', '成员不在房间中');
        m!.status = 'banned';
        m!.online = false;
        this.freeze(r);
      }
      if (action === 'transfer') {
        if (m!.status !== 'approved' || !m!.online)
          throw new AppError('INVALID_MEMBER', '请选择在线成员');
        r.hostId = m!.id;
        this.freeze(r);
        r.mediaEpoch++;
      }
      if (action === 'rotate' || action === 'kick') {
        invite = secret();
        r.inviteHash = hash(invite);
        r.inviteUntil = this.now() + 7200000;
      }
      if (action === 'end') {
        r.closed = true;
        r.inviteHash = hash(secret());
        this.freeze(r);
        r.chat = [];
      }
      r.revision++;
      return { room: this.view(r, session), invite };
    });
    return result;
  }
  async command(session: string, e: CommandEnvelope) {
    return this.transaction(e.roomId, (r) => {
      this.open(r);
      this.owner(r, session);
      r.seen = r.seen.filter((v) => this.now() - v.at < 300000);
      if (r.seen.some((v) => v.id === e.id)) return this.view(r, session);
      if (e.epoch !== r.mediaEpoch || e.revision !== r.revision)
        throw new AppError('STALE_STATE', '房间状态已变化，请重试', 409);
      const c = e.command,
        p = r.playback,
        now = this.now();
      if (c.kind === 'website') {
        const website = websiteSource(c.url);
        r.mediaEpoch++;
        r.playback = {
          kind: 'website',
          title: website.provider + ' · 网站一起看',
          website,
          duration: 864000,
          position: 0,
          paused: true,
          available: true,
          updatedAt: now,
        };
      } else if (c.kind === 'source') {
        r.mediaEpoch++;
        r.playback = {
          kind: 'local',
          title: c.title.replace(/[\u0000-\u001f]/g, ''),
          duration: c.duration,
          position: 0,
          paused: true,
          available: true,
          updatedAt: now,
        };
      } else {
        if (!p.title && c.kind !== 'stop') throw new AppError('NO_SOURCE', '请先选择影片');
        if (!p.paused) p.position = Math.min(p.duration, p.position + (now - p.updatedAt) / 1000);
        if (c.kind === 'play') {
          p.paused = false;
          p.available = true;
        }
        if (c.kind === 'pause') p.paused = true;
        if (c.kind === 'seek') p.position = Math.min(c.position, p.duration);
        if (c.kind === 'stop') {
          this.freeze(r);
        }
        if (c.kind === 'ended') {
          p.paused = true;
          p.position = p.duration;
        }
        p.updatedAt = now;
      }
      if (c.kind === 'source' || c.kind === 'website')
        r.members.forEach((m) => (m.viewing = 'not-ready'));
      r.revision++;
      r.seen.push({ id: e.id, at: now });
      r.seen = r.seen.slice(-256);
      return this.view(r, session);
    });
  }
  async viewing(
    id: string,
    session: string,
    epoch: number,
    state: MemberView['viewing'],
    duration?: number,
  ) {
    return this.transaction(id, (r) => {
      this.open(r);
      const m = this.member(r, session, true);
      if (epoch !== r.mediaEpoch) throw new AppError('STALE_STATE', '影片已更换，请重新准备', 409);
      if (state !== 'not-ready' && r.playback.kind === 'none')
        throw new AppError('NO_SOURCE', '请等待房主选片');
      if (
        state !== 'not-ready' &&
        r.playback.kind === 'local' &&
        (duration === undefined || Math.abs(duration - r.playback.duration) > 1)
      )
        throw new AppError('FILE_MISMATCH', '影片时长不匹配，请选择同一剪辑版本');
      m.viewing = state;
      return this.view(r, session);
    });
  }
  async message(id: string, session: string, text: string, pauseRequest = false) {
    return this.transaction(id, (r) => {
      this.open(r);
      const m = this.member(r, session, true);
      const message: ChatMessage = {
        id: randomUUID(),
        memberId: m.id,
        nickname: m.nickname,
        text: text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ''),
        at: this.now(),
        type: pauseRequest ? 'pause-request' : 'chat',
      };
      r.chat.push(message);
      r.chat = r.chat.slice(-100);
      return this.view(r, session);
    });
  }
  async sweep() {
    for (const id of await this.repository.ids()) {
      try {
        await this.transaction(id, (r) => {
          for (const m of r.members)
            if (m.online && this.now() - m.lastSeen > 45000) m.online = false;
          const host = r.members.find((m) => m.id === r.hostId)!;
          if (!host.online && r.hostOfflineAt === undefined) {
            r.hostOfflineAt = this.now();
            this.freeze(r);
          }
          if (!r.members.some((m) => m.online && m.status === 'approved'))
            r.emptySince ??= this.now();
          if (
            !r.closed &&
            ((r.emptySince !== undefined && this.now() - r.emptySince >= 1800000) ||
              (r.hostOfflineAt !== undefined && this.now() - r.hostOfflineAt >= 600000) ||
              this.now() - r.createdAt >= DAY - 15000)
          ) {
            r.closed = true;
            this.freeze(r);
            r.chat = [];
          }
        });
      } catch {
        /* TTL expiry or unavailable store: never recreate rooms. */
      }
    }
  }
  async recover() {
    for (const id of await this.repository.ids()) {
      try {
        await this.transaction(id, (r) => {
          if (r.protocolVersion !== 2) {
            r.closed = true;
            r.protocolVersion = 2;
            r.chat = [];
            r.playback = {
              kind: 'none',
              title: '',
              duration: 0,
              position: 0,
              paused: true,
              available: false,
              updatedAt: this.now(),
            };
          }
          r.members.forEach((m) => {
            m.online = false;
            m.viewing = 'not-ready';
          });
          r.hostOfflineAt = this.now();
          r.emptySince = this.now();
          this.freeze(r);
        });
      } catch {
        /* Expired rooms are not recreated. */
      }
    }
  }
}
