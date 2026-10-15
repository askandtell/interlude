import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client';
import type { MediaCredentials } from '../../shared/protocol';
import { canUpdateRtcConfiguration, rtcConnectionError } from './rtcCompatibility';
export interface RealtimeTransport {
  connect(credentials: MediaCredentials): Promise<void>;
  publish(stream: MediaStream, height: 720 | 1080): Promise<void>;
  microphone(enabled: boolean, deviceId?: string): Promise<void>;
  setVoiceVolume(volume: number): void;
  outputDevice(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
}
export class LiveTransport implements RealtimeTransport {
  readonly kind = 'relay' as const;
  get state() {
    return this.room.state;
  }
  // Offer-with-join updates an existing peer's configuration. Some embedded browsers
  // reject even a no-op update; LiveKit's dual-peer path creates peers after joining.
  room = new Room({
    adaptiveStream: true,
    dynacast: true,
    singlePeerConnection: canUpdateRtcConfiguration(),
  });
  private audioElements = new Set<HTMLMediaElement>();
  private voiceVolume = 0.8;
  private filmTracks: MediaStreamTrack[] = [];
  private owner = crypto.randomUUID();
  private closed = false;
  constructor(
    private movie: HTMLVideoElement,
    private onState: (state: string) => void,
    private onError: (error: Error) => void,
    onVoices: (members: Record<string, boolean>) => void = () => {},
  ) {
    const voices = () => {
      const members: Record<string, boolean> = {};
      this.room.remoteParticipants.forEach((p) => {
        const pub = p.getTrackPublication(Track.Source.Microphone);
        if (pub) members[p.identity] = !pub.isMuted;
      });
      if (!this.closed) onVoices(members);
    };
    [
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ParticipantDisconnected,
    ].forEach((event) => this.room.on(event, voices));
    this.room.on(RoomEvent.ConnectionStateChanged, (state) => this.onState(state));
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
        if (this.closed || this.movie.dataset.connection !== this.owner) return;
        voices();
        if (
          pub.source === Track.Source.ScreenShare ||
          pub.source === Track.Source.ScreenShareAudio
        ) {
          // attach() also registers the visible element for LiveKit adaptive-stream sizing.
          track.attach(this.movie);
          void this.movie.play().catch(() => this.onState('autoplay-blocked'));
        } else if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.volume = this.voiceVolume;
          el.dataset.voice = 'true';
          el.hidden = true;
          document.body.appendChild(el);
          this.audioElements.add(el);
          void el.play().catch(() => this.onState('autoplay-blocked'));
        }
      },
    );
    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => {
        this.audioElements.delete(el);
        if (el !== this.movie) el.remove();
      });
      if (this.movie.srcObject instanceof MediaStream)
        this.movie.srcObject.removeTrack(track.mediaStreamTrack);
    });
    this.room.on(RoomEvent.MediaDevicesError, (error) => this.onError(error));
    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!this.room.canPlaybackAudio) this.onState('autoplay-blocked');
    });
  }
  async connect(c: MediaCredentials) {
    this.movie.dataset.connection = this.owner;
    try {
      await this.room.connect(c.url, c.token);
    } catch (error) {
      throw rtcConnectionError(error);
    }
  }
  async publish(stream: MediaStream, height: 720 | 1080) {
    for (const old of this.filmTracks) await this.room.localParticipant.unpublishTrack(old, false);
    this.filmTracks = [];
    try {
      for (const track of stream.getTracks()) {
        await this.room.localParticipant.publishTrack(track, {
          source: track.kind === 'video' ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio,
          simulcast: track.kind === 'video',
          videoEncoding: height === 1080 ? VideoPresets.h1080.encoding : VideoPresets.h720.encoding,
          audioPreset: { maxBitrate: 128000 },
          forceStereo: true,
          dtx: false,
        });
        this.filmTracks.push(track);
      }
    } catch (e) {
      for (const track of this.filmTracks)
        await this.room.localParticipant.unpublishTrack(track, false).catch(() => {});
      this.filmTracks = [];
      throw e;
    }
  }
  async microphone(enabled: boolean, deviceId?: string) {
    if (enabled && deviceId) await this.room.switchActiveDevice('audioinput', deviceId);
    await this.room.localParticipant.setMicrophoneEnabled(enabled, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(deviceId ? { deviceId } : {}),
    });
  }
  setVoiceVolume(volume: number) {
    this.voiceVolume = volume;
    this.audioElements.forEach((el) => (el.volume = volume));
  }
  async resumeAudio() {
    await this.room.startAudio();
    for (const el of this.audioElements) await el.play();
    if (this.movie.srcObject) await this.movie.play();
    if (!this.closed) this.onState(this.room.state);
  }
  async outputDevice(deviceId: string) {
    await this.room.switchActiveDevice('audiooutput', deviceId || 'default');
  }
  async disconnect() {
    this.closed = true;
    for (const publication of this.room.localParticipant.audioTrackPublications.values())
      if (publication.source === Track.Source.Microphone) publication.track?.stop();
    await this.room.disconnect(false);
    for (const el of this.audioElements) el.remove();
    this.audioElements.clear();
    if (this.movie.dataset.connection === this.owner) {
      this.movie.srcObject = null;
      delete this.movie.dataset.connection;
    }
    this.filmTracks = [];
  }
}
