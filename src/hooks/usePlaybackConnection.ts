import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { MediaCredentials, RoomView } from '../../shared/protocol';
import { api } from '../api';
import type { LocalSource } from '../media/LocalSource';
import type { LiveTransport } from '../media/LiveTransport';

export function usePlaybackConnection(
  room: RoomView | undefined,
  connected: boolean,
  movie: RefObject<HTMLVideoElement>,
  source: MutableRefObject<LocalSource | undefined>,
  onError: (e: unknown) => void,
) {
  const [state, setState] = useState('disconnected'),
    [mic, setMic] = useState(false),
    [hasPicture, setHasPicture] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<Record<string, boolean>>({});
  const transport = useRef<LiveTransport>(),
    inFlight = useRef<LiveTransport>(),
    pending = useRef<Promise<LiveTransport>>(),
    epoch = useRef(-1),
    generation = useRef(0);
  const current = useRef(room);
  current.current = room;
  const disconnect = useCallback(async () => {
    generation.current++;
    const old = transport.current || inFlight.current;
    transport.current = undefined;
    inFlight.current = undefined;
    pending.current = undefined;
    epoch.current = -1;
    setMic(false);
    setState('disconnected');
    setHasPicture(false);
    setVoiceMembers({});
    if (old) await old.disconnect().catch(onError);
  }, [onError]);
  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [room?.id, disconnect]);
  useEffect(() => {
    if (!room || room.closed || room.selfStatus !== 'approved') {
      void disconnect();
      return;
    }
    if (epoch.current >= 0 && epoch.current !== room.transportEpoch) {
      source.current?.pause();
      void disconnect();
    }
  }, [room?.transportEpoch, room?.closed, room?.selfStatus, room?.id, disconnect, source]);
  useEffect(() => {
    if (!connected) source.current?.pause();
  }, [connected, source]);
  useEffect(() => {
    let lastFrames = -1;
    const timer = setInterval(() => {
      const v = movie.current;
      if (
        !(v?.srcObject instanceof MediaStream) ||
        !v.srcObject.getVideoTracks().some((track) => track.readyState === 'live')
      ) {
        setHasPicture(false);
        lastFrames = -1;
        return;
      }
      const frames = v.getVideoPlaybackQuality?.().totalVideoFrames ?? (v.readyState >= 2 ? 1 : 0);
      if (frames > lastFrames && v.videoWidth > 0) setHasPicture(true);
      lastFrames = frames;
    }, 250);
    return () => clearInterval(timer);
  }, [movie, room?.mediaEpoch]);
  const ensure = useCallback(async () => {
    if (transport.current?.room.state === 'connected') return transport.current;
    if (pending.current) return pending.current;
    const view = current.current;
    if (!view || !movie.current || view.closed) throw new Error('放映室尚未就绪');
    const id = ++generation.current;
    setState('connecting');
    pending.current = (async () => {
      const credentials = await api<MediaCredentials>(`/api/rooms/${view.id}/media-token`, {});
      if (
        id !== generation.current ||
        current.current?.id !== view.id ||
        current.current.transportEpoch !== credentials.transportEpoch
      )
        throw new Error('房间连接已变化，请重试');
      const { LiveTransport } = await import('../media/LiveTransport');
      const next = new LiveTransport(
        movie.current!,
        (value) => {
          if (id === generation.current) setState(value);
        },
        (e) => {
          if (id === generation.current) onError(e);
        },
        (members) => {
          if (id === generation.current) setVoiceMembers(members);
        },
      );
      inFlight.current = next;
      try {
        await next.connect(credentials);
        if (
          id !== generation.current ||
          current.current?.id !== view.id ||
          current.current.transportEpoch !== credentials.transportEpoch
        )
          throw new Error('房间连接已变化，请重试');
        transport.current = next;
        inFlight.current = undefined;
        epoch.current = credentials.transportEpoch;
        return next;
      } catch (e) {
        await next.disconnect();
        if (id === generation.current) setState('disconnected');
        throw e;
      }
    })();
    try {
      return await pending.current;
    } catch (e) {
      if (id === generation.current) setState('disconnected');
      throw e;
    } finally {
      if (id === generation.current) pending.current = undefined;
    }
  }, [movie, onError]);
  const microphone = useCallback(
    async (enabled: boolean, deviceId?: string) => {
      const next = await ensure();
      const id = generation.current;
      await next.microphone(enabled, deviceId);
      if (id !== generation.current || transport.current !== next) {
        await next.microphone(false).catch(() => {});
        return;
      }
      setMic(enabled);
    },
    [ensure],
  );
  return { state, mic, hasPicture, voiceMembers, transport, ensure, disconnect, microphone };
}
