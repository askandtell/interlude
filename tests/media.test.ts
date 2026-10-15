import { describe, expect, it } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import { TrackSource } from '@livekit/protocol';
import { Rooms } from '../server/rooms';
import { MemoryRepository } from '../server/store';
import { MediaService } from '../server/media';
const config={url:'ws://localhost:7880',internalUrl:'http://localhost:7880',key:'test-api',secret:'a-long-random-testing-secret-1234567890'};
describe('media authorization',()=>{
  it('reports a media-specific outage without returning a token or leaking upstream errors',async()=>{
    const rooms=new Rooms(new MemoryRepository());const {room}=await rooms.create('host','test','host');const record=await rooms.load(room.id);
    const media=new MediaService(config);(media as unknown as {client:unknown}).client={createRoom:async()=>{throw new Error('private endpoint and secret');}};
    await expect(media.credentials(record,record.hostId)).rejects.toMatchObject({code:'MEDIA_UNAVAILABLE',status:503});
    await expect(media.credentials(record,record.hostId)).rejects.toThrow('影片文件仍保留');
  });
  async function setup(){const rooms=new Rooms(new MemoryRepository());const created=await rooms.create('host','test','host');const guest=await rooms.join(created.room.id,'guest',created.invite,'guest');await rooms.manage(created.room.id,'host','approve',guest.selfId);await rooms.transaction(created.room.id,r=>{r.delivery={mode:'relay',reason:'manual',resume:false,since:Date.now()};});const record=await rooms.load(created.room.id);const media=new MediaService(config);(media as unknown as {client:unknown}).client={createRoom:async()=>({}),listParticipants:async()=>[]};return {rooms,record,media,guest};}
  it('issues short-lived room-scoped guest tokens with microphone-only publication',async()=>{const {record,media,guest}=await setup();const c=await media.credentials(record,guest.selfId);const grants=await new TokenVerifier(config.key,config.secret).verify(c.token);expect(grants.video?.room).toBe(c.room);expect(grants.video?.canPublishSources).toEqual(['microphone']);expect(grants.video?.roomAdmin).not.toBe(true);expect(grants.video?.canPublishData).toBe(false);const payload=JSON.parse(Buffer.from(c.token.split('.')[1],'base64url').toString());expect(payload.exp-payload.nbf).toBeLessThanOrEqual(120);});
  it('limits host sources to movie video/audio and microphone, not camera',async()=>{const {record,media}=await setup();const c=await media.credentials(record,record.hostId);const claims=await new TokenVerifier(config.key,config.secret).verify(c.token);expect(claims.video?.canPublishSources).toEqual(['microphone','screen_share','screen_share_audio']);});
  it('detects duplicate and forbidden published track sources',async()=>{const {record,media,guest}=await setup();(media as unknown as {client:unknown}).client={listParticipants:async()=>[{identity:guest.selfId,tracks:[{source:TrackSource.MICROPHONE},{source:TrackSource.MICROPHONE}]},{identity:record.hostId,tracks:[{source:TrackSource.CAMERA}]}]};expect(await media.violations(record)).toEqual([guest.selfId,record.hostId]);});
  it('rejects unsigned media notifications',async()=>{await expect(new MediaService(config).webhook('{}','forged')).rejects.toMatchObject({code:'WEBHOOK_AUTH'});});
  it('bans an abusive guest and blocks new media until old room cleanup succeeds',async()=>{const {rooms,record,guest}=await setup();rooms.retire=async()=>{throw new Error('unavailable');};await rooms.rejectMedia(record.id,guest.selfId);await expect(rooms.snapshot(record.id,'guest')).rejects.toMatchObject({code:'FORBIDDEN'});expect((await rooms.snapshot(record.id,'host')).mediaDegraded).toBe(true);});
});
