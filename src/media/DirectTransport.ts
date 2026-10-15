import type { Socket } from 'socket.io-client';
import type { RoomView } from '../../shared/protocol';
import type { IncomingPeerSignal, PeerRoster } from '../../shared/peer';
import { emit } from '../api';
import type { MediaTransport } from './transport';

interface Pair {
  pc: RTCPeerConnection;
  id: string;
  linkId: string;
  offerer: boolean;
  movieVideo?: RTCRtpTransceiver;
  movieAudio?: RTCRtpTransceiver;
  voice?: RTCRtpTransceiver;
  candidates: RTCIceCandidateInit[];
  queue: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
}
export class DirectTransport implements MediaTransport {
  readonly kind = 'direct' as const;
  state = 'disconnected';
  private nonce = crypto.randomUUID();
  private pairs = new Map<string, Pair>();
  private audio = new Map<string, HTMLAudioElement>();
  private film?: MediaStream;
  private mic?: MediaStreamTrack;
  private micGeneration = 0;
  private volume = 0.8;
  private outputId = 'default';
  private closed = false;
  private falling = false;
  private blocked = false;
  private monitor?: ReturnType<typeof setInterval>;
  private lastFrames = 0;
  private pictureAt = Date.now();
  private guestResolve?: () => void;
  private guestReject?: (e: Error) => void;
  private guestTimer?: ReturnType<typeof setTimeout>;
  private voices: Record<string, boolean> = {};
  private socketId?: string;
  constructor(
    private view: RoomView,
    private socket: Socket,
    private movie: HTMLVideoElement,
    private onState: (s: string) => void,
    private onError: (e: Error) => void,
    private onVoices: (v: Record<string, boolean>) => void,
    private fallback: () => Promise<unknown>,
    private iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }],
  ) {}
  private setState(s: string) {
    if (!this.closed) {
      if (s === 'autoplay-blocked') this.blocked = true;
      if (s === 'connected' && this.blocked) s = 'autoplay-blocked';
      this.state = s;
      this.onState(s);
    }
  }
  private envelope() {
    return { epoch: this.view.transportEpoch, mediaEpoch: this.view.mediaEpoch };
  }
  update(view: RoomView) {
    this.view = view;
    if (!this.closed && this.socket.connected && this.socketId !== this.socket.id) {
      this.socketId = this.socket.id;
      void emit<PeerRoster>(this.socket, 'peer-ready', { ...this.envelope(), nonce: this.nonce })
        .then((roster) => {
          this.roster(roster);
          if (this.view.selfId === this.view.hostId) this.setState('connected');
        })
        .catch((e) => {
          if (!this.closed) this.onError(e);
        });
    }
  }
  private controlLost = () => {
    for (const id of [...this.pairs.keys()]) this.remove(id);
    this.mic?.stop();
    this.mic = undefined;
    this.micGeneration++;
    this.socketId = undefined;
    this.setState('reconnecting');
  };
  private signal(pair: Pair, payload: object) {
    return emit(this.socket, 'peer-signal', {
      ...this.envelope(),
      target: pair.id,
      linkId: pair.linkId,
      ...payload,
    });
  }
  private fail = async () => {
    if (this.closed || this.falling) return;
    this.falling = true;
    this.setState('migrating');
    try {
      await this.fallback();
    } catch (e) {
      if (!this.closed) {
        this.falling = false;
        this.setState('disconnected');
        this.guestReject?.(e instanceof Error ? e : new Error('无法切换媒体，请重试'));
        this.onError(e instanceof Error ? e : new Error('直连与转发暂时都不可用，请重试'));
      }
    }
  };
  async connect() {
    if (!this.socket.connected) throw new Error('请先恢复房间控制连接');
    this.setState('connecting');
    this.socketId = this.socket.id;
    this.socket.on('disconnect', this.controlLost);
    this.socket.on('peer-roster', this.roster);
    this.socket.on('peer-signal', this.receive);
    const guest = this.view.selfId !== this.view.hostId;
    let waiting: Promise<void> | undefined;
    if (guest) {
      waiting = new Promise<void>((resolve, reject) => {
        this.guestResolve = resolve;
        this.guestReject = reject;
      });
      void waiting.catch(() => {});
    }
    const roster = await emit<PeerRoster>(this.socket, 'peer-ready', {
      ...this.envelope(),
      nonce: this.nonce,
    });
    this.roster(roster);
    if (!guest) this.setState('connected');
    this.monitor = setInterval(() => {
      if (this.closed) return;
      const video = this.movie;
      const frames = video.getVideoPlaybackQuality?.().totalVideoFrames || 0;
      if (frames > this.lastFrames) {
        this.lastFrames = frames;
        this.pictureAt = Date.now();
      }
      if (
        !guest ||
        this.blocked ||
        !this.pairs.has(this.view.hostId) ||
        this.view.playback.paused ||
        !this.view.playback.available ||
        this.view.playback.website
      )
        this.pictureAt = Date.now();
      else if (Date.now() - this.pictureAt > 12000) void this.fail();
    }, 1000);
    if (waiting) await waiting;
  }
  private roster = (roster: PeerRoster) => {
    if (
      this.closed ||
      roster.roomId !== this.view.id ||
      roster.epoch !== this.view.transportEpoch ||
      roster.mediaEpoch !== this.view.mediaEpoch
    )
      return;
    const ids = new Set(roster.members.map((m) => m.id));
    for (const [id, pair] of this.pairs) {
      const peer = roster.members.find((m) => m.id === id);
      if (!peer || pair.linkId !== [peer.nonce, this.nonce].sort().join('/')) this.remove(id);
    }
    for (const peer of roster.members)
      if (peer.id !== this.view.selfId && !this.pairs.has(peer.id))
        this.add(peer.id, [this.nonce, peer.nonce].sort().join('/'));
    if (this.view.selfId !== this.view.hostId && !ids.has(this.view.hostId)) {
      this.movie.pause();
      this.movie.srcObject = null;
      this.pictureAt = Date.now();
    }
  };
  private add(id: string, linkId: string) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    const host = this.view.selfId === this.view.hostId,
      withHost = host || id === this.view.hostId;
    const offerer = host || (id !== this.view.hostId && this.view.selfId < id);
    // The answering side adopts transceivers from the offer. Pre-creating them
    // with addTransceiver would reserve unmatched m-lines in Chromium.
    const movieVideo =
      offerer && withHost ? pc.addTransceiver('video', { direction: 'sendonly' }) : undefined;
    const movieAudio =
      offerer && withHost ? pc.addTransceiver('audio', { direction: 'sendonly' }) : undefined;
    const voice = offerer ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : undefined;
    const pair: Pair = {
      pc,
      id,
      linkId,
      offerer,
      movieVideo,
      movieAudio,
      voice,
      candidates: [],
      queue: Promise.resolve(),
      timer: setTimeout(() => {
        if (pc.connectionState !== 'connected') void this.fail();
      }, 12000),
    };
    this.pairs.set(id, pair);
    pc.onicecandidate = (e) => {
      if (e.candidate && !this.closed)
        void this.signal(pair, { candidate: e.candidate.toJSON() }).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(pair.timer);
        if (id === this.view.hostId) {
          clearTimeout(this.guestTimer);
          this.guestResolve?.();
          this.setState('connected');
        }
        void pc
          .getStats()
          .then((stats) => {
            stats.forEach((report) => {
              if (
                report.type === 'candidate-pair' &&
                report.state === 'succeeded' &&
                report.nominated
              ) {
                const local = stats.get(report.localCandidateId);
                const remote = stats.get(report.remoteCandidateId);
                if (local?.candidateType === 'relay' || remote?.candidateType === 'relay')
                  void this.fail();
              }
            });
          })
          .catch(() => {});
      } else if (pc.connectionState === 'failed') void this.fail();
      else if (pc.connectionState === 'disconnected') {
        clearTimeout(pair.timer);
        pair.timer = setTimeout(() => {
          if (pc.connectionState !== 'connected') void this.fail();
        }, 6000);
      }
    };
    pc.ontrack = (e) => {
      if (this.closed) return;
      if (!offerer) this.adopt(pair);
      if (
        id === this.view.hostId &&
        (e.transceiver === pair.movieVideo || e.transceiver === pair.movieAudio)
      ) {
        const stream =
          this.movie.srcObject instanceof MediaStream ? this.movie.srcObject : new MediaStream();
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        this.movie.srcObject = stream;
        void this.movie.play().catch(() => this.setState('autoplay-blocked'));
        e.track.onended = () => stream.removeTrack(e.track);
      } else if (e.transceiver === pair.voice && e.track.kind === 'audio') {
        const el = document.createElement('audio');
        el.hidden = true;
        el.autoplay = true;
        el.dataset.voice = 'true';
        el.volume = this.volume;
        el.srcObject = new MediaStream([e.track]);
        const previous = this.audio.get(id);
        if (previous) {
          previous.srcObject = null;
          previous.remove();
        }
        if ('setSinkId' in el)
          void (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
            .setSinkId(this.outputId)
            .catch(() => {});
        this.audio.set(id, el);
        document.body.append(el);
        const update = () => {
          this.voices[id] = !e.track.muted && e.track.readyState === 'live';
          this.onVoices({ ...this.voices });
        };
        e.track.onmute = update;
        e.track.onunmute = update;
        e.track.onended = update;
        update();
        void el.play().catch(() => this.setState('autoplay-blocked'));
      } else e.track.stop();
    };
    pair.queue = (async () => {
      if (host && this.film) await this.attachFilm(pair);
      if (this.mic) await pair.voice?.sender.replaceTrack(this.mic);
      if (pair.offerer) {
        await pc.setLocalDescription(await pc.createOffer());
        await this.signal(pair, { description: { type: 'offer', sdp: pc.localDescription!.sdp } });
      }
    })().catch(() => {
      if (!this.closed) void this.fail();
    });
  }
  private adopt(pair: Pair) {
    const transceivers = pair.pc.getTransceivers().filter((t) => t.mid !== null);
    const withHost = this.view.selfId === this.view.hostId || pair.id === this.view.hostId;
    if (withHost) {
      pair.movieVideo = transceivers[0];
      pair.movieAudio = transceivers[1];
    }
    pair.voice = transceivers[withHost ? 2 : 0];
    if (pair.movieVideo) pair.movieVideo.direction = 'recvonly';
    if (pair.movieAudio) pair.movieAudio.direction = 'recvonly';
    if (pair.voice) pair.voice.direction = 'sendrecv';
  }
  private receive = (data: IncomingPeerSignal) => {
    if (
      this.closed ||
      data.epoch !== this.view.transportEpoch ||
      data.mediaEpoch !== this.view.mediaEpoch
    )
      return;
    const pair = this.pairs.get(data.from);
    if (!pair || pair.linkId !== data.linkId) return;
    pair.queue = pair.queue
      .then(async () => {
        if (this.closed || this.pairs.get(pair.id) !== pair) return;
        if (data.description) {
          if (
            (data.description.type === 'offer' && pair.offerer) ||
            (data.description.type === 'answer' && !pair.offerer)
          )
            return;
          await pair.pc.setRemoteDescription(data.description);
          if (!pair.offerer) {
            this.adopt(pair);
            if (this.mic) await pair.voice?.sender.replaceTrack(this.mic);
          }
          for (const candidate of pair.candidates.splice(0))
            await pair.pc.addIceCandidate(candidate);
          if (data.description.type === 'offer') {
            await pair.pc.setLocalDescription(await pair.pc.createAnswer());
            await this.signal(pair, {
              description: { type: 'answer', sdp: pair.pc.localDescription!.sdp },
            });
          }
        } else if (data.candidate) {
          if (pair.pc.remoteDescription) await pair.pc.addIceCandidate(data.candidate);
          else if (pair.candidates.length < 32) pair.candidates.push(data.candidate);
        }
      })
      .catch(() => {
        if (!this.closed) void this.fail();
      });
  };
  private async attachFilm(pair: Pair) {
    await pair.movieVideo?.sender.replaceTrack(this.film?.getVideoTracks()[0] || null);
    await pair.movieAudio?.sender.replaceTrack(this.film?.getAudioTracks()[0] || null);
    if (pair.movieVideo) {
      const params = pair.movieVideo.sender.getParameters();
      if (params.encodings?.length) {
        params.encodings[0].maxBitrate = 2500000;
        await pair.movieVideo.sender.setParameters(params).catch(() => {});
      }
    }
  }
  async publish(stream: MediaStream, _height: 720 | 1080) {
    if (this.closed) throw new Error('直连已关闭');
    this.film = stream;
    for (const pair of this.pairs.values()) await this.attachFilm(pair);
  }
  async microphone(enabled: boolean, deviceId?: string) {
    const generation = ++this.micGeneration;
    if (!enabled) {
      this.mic?.stop();
      this.mic = undefined;
      await Promise.allSettled(
        [...this.pairs.values()].map((p) => p.voice?.sender.replaceTrack(null)),
      );
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
    const track = stream.getAudioTracks()[0];
    if (this.closed || generation !== this.micGeneration) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.mic?.stop();
    this.mic = track;
    try {
      for (const p of this.pairs.values()) await p.voice?.sender.replaceTrack(track);
    } catch (e) {
      track.stop();
      this.mic = undefined;
      throw e;
    }
  }
  setVoiceVolume(volume: number) {
    this.volume = volume;
    for (const el of this.audio.values()) el.volume = volume;
  }
  async resumeAudio() {
    for (const el of this.audio.values()) await el.play();
    if (this.movie.srcObject) await this.movie.play();
    this.blocked = false;
    this.setState('connected');
  }
  async outputDevice(id: string) {
    this.outputId = id || 'default';
    for (const el of [this.movie, ...this.audio.values()]) {
      if ('setSinkId' in el)
        await (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
          id || 'default',
        );
    }
  }
  private remove(id: string) {
    const p = this.pairs.get(id);
    if (p) {
      clearTimeout(p.timer);
      p.pc.ontrack = null;
      p.pc.onicecandidate = null;
      p.pc.onconnectionstatechange = null;
      p.pc.close();
      this.pairs.delete(id);
    }
    const el = this.audio.get(id);
    if (el) {
      el.srcObject = null;
      el.remove();
      this.audio.delete(id);
    }
    delete this.voices[id];
    this.onVoices({ ...this.voices });
  }
  async disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.state = 'disconnected';
    this.micGeneration++;
    clearTimeout(this.guestTimer);
    clearInterval(this.monitor);
    this.guestReject?.(new Error('直连已关闭'));
    this.socket.off('peer-roster', this.roster);
    this.socket.off('peer-signal', this.receive);
    this.socket.off('disconnect', this.controlLost);
    for (const id of [...this.pairs.keys()]) this.remove(id);
    this.mic?.stop();
    this.mic = undefined;
    this.film = undefined;
    if (this.view.selfId !== this.view.hostId) {
      this.movie.srcObject = null;
    }
    if (this.socket.connected) void emit(this.socket, 'peer-leave', {}).catch(() => {});
  }
}
