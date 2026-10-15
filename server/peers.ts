import type { Server, Socket } from 'socket.io';
import type { Rooms, RoomRecord } from './rooms';
import { AppError } from './security';
import {
  peerEpochSchema,
  peerReadySchema,
  peerSignalSchema,
  type PeerRoster,
} from '../shared/peer';

interface Ready {
  roomId: string;
  memberId: string;
  epoch: number;
  mediaEpoch: number;
  nonce: string;
}
/** Signaling only: SDP is forwarded to an approved peer, never logged or persisted. */
export class PeerBroker {
  private ready = new Map<string, Ready>();
  constructor(
    private rooms: Rooms,
    private io: Server,
  ) {}
  private roster(r: RoomRecord): PeerRoster {
    return {
      roomId: r.id,
      epoch: r.transportEpoch,
      mediaEpoch: r.mediaEpoch,
      members: [...this.ready.values()]
        .filter((v) => v.roomId === r.id)
        .map((v) => ({ id: v.memberId, nonce: v.nonce })),
    };
  }
  private trim(r: RoomRecord) {
    for (const [id, v] of this.ready)
      if (
        v.roomId === r.id &&
        (r.closed ||
          r.delivery?.mode !== 'direct' ||
          v.epoch !== r.transportEpoch ||
          v.mediaEpoch !== r.mediaEpoch ||
          !r.members.some((m) => m.id === v.memberId && m.status === 'approved' && m.online) ||
          !this.io.sockets.sockets.has(id))
      )
        this.ready.delete(id);
  }
  private broadcast(r: RoomRecord) {
    const roster = this.roster(r);
    for (const [id, v] of this.ready)
      if (v.roomId === r.id) this.io.sockets.sockets.get(id)?.emit('peer-roster', roster);
    return roster;
  }
  async prune(id: string) {
    await this.rooms.transaction(
      id,
      (r) => {
        this.trim(r);
        this.broadcast(r);
      },
      false,
    );
  }
  private check(r: RoomRecord, socket: Socket, data: { epoch: number; mediaEpoch: number }) {
    this.rooms.open(r);
    const member = this.rooms.member(r, socket.data.session, true);
    if (!member.online || this.rooms.now() - member.lastSeen >= 45000)
      throw new AppError('FORBIDDEN', '请先恢复房间在线状态');
    if (
      r.delivery?.mode !== 'direct' ||
      data.epoch !== r.transportEpoch ||
      data.mediaEpoch !== r.mediaEpoch
    )
      throw new AppError('STALE_STATE', '直连代次已失效');
    this.trim(r);
    return member;
  }
  async join(socket: Socket, input: unknown) {
    const data = peerReadySchema.parse(input);
    return this.rooms.transaction(
      socket.data.roomId,
      (r) => {
        const me = this.check(r, socket, data);
        if (
          [...this.ready].some(
            ([id, v]) => id !== socket.id && v.roomId === r.id && v.memberId === me.id,
          )
        )
          throw new AppError(
            'MEDIA_TAB_IN_USE',
            '这个身份已在另一页面观看，请先关闭那里的媒体连接',
          );
        this.ready.set(socket.id, { roomId: r.id, memberId: me.id, ...data });
        return this.broadcast(r);
      },
      false,
    );
  }
  async signal(socket: Socket, input: unknown) {
    const data = peerSignalSchema.parse(input);
    return this.rooms.transaction(
      socket.data.roomId,
      (r) => {
        const me = this.check(r, socket, data);
        const sender = this.ready.get(socket.id);
        if (!sender || sender.memberId !== me.id)
          throw new AppError('FORBIDDEN', '请先加入直连媒体');
        const target = [...this.ready].find(
          ([, v]) => v.roomId === r.id && v.memberId === data.target,
        );
        if (!target || data.target === me.id) throw new AppError('PEER_GONE', '对方已离开直连');
        if (data.linkId !== [sender.nonce, target[1].nonce].sort().join('/'))
          throw new AppError('STALE_STATE', '点对点连接已更换');
        const { target: _, ...payload } = data;
        this.io.sockets.sockets.get(target[0])?.emit('peer-signal', { ...payload, from: me.id });
        return {};
      },
      false,
    );
  }
  async fallback(socket: Socket, input: unknown) {
    const data = peerEpochSchema.parse(input),
      ready = this.ready.get(socket.id);
    if (
      !ready ||
      ready.roomId !== socket.data.roomId ||
      ready.epoch !== data.epoch ||
      ready.mediaEpoch !== data.mediaEpoch
    )
      throw new AppError('FORBIDDEN', '只有当前直连成员可以请求回退');
    return this.rooms.directFailed(
      socket.data.roomId,
      socket.data.session,
      data.epoch,
      data.mediaEpoch,
    );
  }
  leave(socket: Socket) {
    const old = this.ready.get(socket.id);
    this.ready.delete(socket.id);
    if (old) void this.prune(old.roomId).catch(() => {});
  }
}
