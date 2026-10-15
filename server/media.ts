import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { TrackSource } from '@livekit/protocol';
import { AppError } from './security.ts';
import { mediaRoomName, type RoomRecord } from './rooms.ts';
export interface MediaConfig { url: string; internalUrl: string; key: string; secret: string; }
export class MediaService {
  private client?: RoomServiceClient;
  constructor(public config?: MediaConfig) { if (config) this.client = new RoomServiceClient(config.internalUrl, config.key, config.secret); }
  async credentials(r: RoomRecord, id: string) {
    if (!this.config || !this.client) throw new AppError('MEDIA_UNAVAILABLE', '媒体服务未就绪，请启动 LiveKit 后重试', 503);
    const name = mediaRoomName(r);
    try { await this.client.createRoom({ name, maxParticipants: 8, emptyTimeout: 60, departureTimeout: 30 }); }
    catch { throw new AppError('MEDIA_UNAVAILABLE', '无法连接媒体服务，影片文件仍保留。请确认 LiveKit 正在运行后重试播放', 503); }
    const host = id === r.hostId, token = new AccessToken(this.config.key, this.config.secret, { identity: id, ttl: '2m' });
    token.addGrant({ roomJoin: true, room: name, canSubscribe: true, canPublish: true, canPublishData: false,
      canPublishSources: host ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [TrackSource.MICROPHONE] });
    return { url: this.config.url, token: await token.toJwt(), room: name, transportEpoch: r.transportEpoch };
  }
  async retire(name: string) { if (!this.client) return; try { await this.client.deleteRoom(name); } catch (e) { if ((e as { code?: string }).code !== 'not_found') throw e; } }
  async webhook(body: string, authorization: string) { if (!this.config) throw new AppError('WEBHOOK_AUTH', '无效媒体通知', 401); try { return await new WebhookReceiver(this.config.key, this.config.secret).receive(body, authorization); } catch { throw new AppError('WEBHOOK_AUTH', '无效媒体通知', 401); } }
  async remove(name: string, identity: string) { await this.client?.removeParticipant(name, identity); }
  async violations(r: RoomRecord) {
    if (!this.client) return [];
    const participants = await this.client.listParticipants(mediaRoomName(r));
    return participants.filter(p => {
      const member = r.members.find(m => m.id === p.identity);
      if (!member || member.status !== 'approved' || r.closed) return true;
      const sources = p.tracks.map(t => t.source);
      const allowed = member.id === r.hostId ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [TrackSource.MICROPHONE];
      return sources.length > allowed.length || new Set(sources).size !== sources.length || sources.some(source => !allowed.includes(source));
    }).map(p => p.identity);
  }
  async ping() { if (!this.client) return false; try { await this.client.listRooms(); return true; } catch { return false; } }
}
