import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { MediaCredentials, RoomView, PlaybackCommand } from '../../shared/protocol';
import type { Socket } from 'socket.io-client';
import { api, emit } from '../api';
import type { LocalSource } from '../media/LocalSource';
import type { MediaTransport } from '../media/transport';
import { DirectTransport } from '../media/DirectTransport';

export function usePlaybackConnection(
  room: RoomView | undefined,
  connected: boolean,
  movie: RefObject<HTMLVideoElement>,
  source: MutableRefObject<LocalSource | undefined>,
  onError: (e: unknown) => void,
  socket: MutableRefObject<Socket | undefined>,
  accept: (view: RoomView) => void,
  control: (command: PlaybackCommand) => Promise<RoomView>,
  quality: 720 | 1080,
) {
  const [state, setState] = useState('disconnected'),
    [mic, setMic] = useState(false),
    [hasPicture, setHasPicture] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<Record<string, boolean>>({});
  const transport = useRef<MediaTransport>(),
    inFlight = useRef<MediaTransport>(),
    pending = useRef<Promise<MediaTransport>>(),
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
    if (!connected) {
      source.current?.pause();
      setMic(false);
      void (transport.current || inFlight.current)?.microphone(false).catch(() => {});
    }
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
    if (transport.current && ['connected', 'autoplay-blocked'].includes(transport.current.state))
      return transport.current;
    if (transport.current && ['connecting', 'reconnecting'].includes(transport.current.state))
      throw new Error('媒体连接正在恢复，请稍后重试');
    if (pending.current) return pending.current;
    if (transport.current) {
      const old = transport.current;
      transport.current = undefined;
      await old.disconnect();
    }
    const view = current.current;
    if (!view || !movie.current || view.closed) throw new Error('放映室尚未就绪');
    const id = ++generation.current;
    epoch.current = view.transportEpoch;
    setState('connecting');
    pending.current = (async () => {
      const credentials =
        view.delivery.mode === 'relay'
          ? await api<MediaCredentials>(`/api/rooms/${view.id}/media-token`, {})
          : undefined;
      if (
        id !== generation.current ||
        current.current?.id !== view.id ||
        current.current.transportEpoch !== view.transportEpoch
      )
        throw new Error('房间连接已变化，请重试');
      const { LiveTransport } = await import('../media/LiveTransport');
      const onState = (value: string) => {
          if (id === generation.current) setState(value);
        },
        onFailure = (e: Error) => {
          if (id === generation.current) onError(e);
        },
        onVoices = (members: Record<string, boolean>) => {
          if (id === generation.current) setVoiceMembers(members);
        };
      if (!socket.current?.connected) throw new Error('请先恢复房间控制连接');
      const next = credentials
        ? new LiveTransport(movie.current!, onState, onFailure, onVoices)
        : new DirectTransport(
            view,
            socket.current,
            movie.current!,
            onState,
            onFailure,
            onVoices,
            async () =>
              accept(
                await emit<RoomView>(socket.current, 'peer-fallback', {
                  epoch: view.transportEpoch,
                  mediaEpoch: view.mediaEpoch,
                }),
              ),
          );
      inFlight.current = next;
      try {
        if (next instanceof DirectTransport) await next.connect();
        else await next.connect(credentials!);
        if (
          id !== generation.current ||
          current.current?.id !== view.id ||
          current.current.transportEpoch !== view.transportEpoch
        )
          throw new Error('房间连接已变化，请重试');
        transport.current = next;
        inFlight.current = undefined;
        epoch.current = view.transportEpoch;
        return next;
      } catch (e) {
        await next.disconnect();
        if (inFlight.current === next) inFlight.current = undefined;
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
  }, [movie, onError, socket, accept]);
  const previous = useRef(room);
  useEffect(() => {
    const oldView = previous.current;
    previous.current = room;
    const active = transport.current || inFlight.current;
    if (!room || room.closed || room.selfStatus !== 'approved') {
      void disconnect();
      return;
    }
    const changed = epoch.current >= 0 && epoch.current !== room.transportEpoch;
    const newSource = oldView?.id === room.id && oldView.mediaEpoch !== room.mediaEpoch;
    if (active && (changed || newSource)) {
      source.current?.pause();
      const routeChanged = oldView?.delivery.mode !== room.delivery.mode;
      const viewer = room.selfId !== room.hostId;
      // Only an already opted-in viewer or a route migration reconnects automatically.
      // Revocation, transfer, refresh and control reconnection never restart playback.
      const restart =
        connected && oldView?.hostId === room.hostId && (routeChanged || (viewer && newSource));
      void disconnect()
        .then(async () => {
          if (
            !restart ||
            current.current?.transportEpoch !== room.transportEpoch ||
            current.current?.id !== room.id
          )
            return;
          const next = await ensure();
          if (
            !viewer &&
            source.current &&
            current.current?.transportEpoch === room.transportEpoch
          ) {
            await next.publish(await source.current.stream(quality), quality);
            if (current.current.delivery.resume && current.current.mediaEpoch === room.mediaEpoch)
              await control({ kind: 'play' });
          }
        })
        .catch(onError);
    } else if (active instanceof DirectTransport) active.update(room);
  }, [room, connected, disconnect, ensure, source, quality, control, onError]);
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
