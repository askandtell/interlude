import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { PlaybackCommand, RoomView, ViewingState } from '../../shared/protocol';
import { api, command, connectRoom, emit } from '../api';

export function useRoomSession(
  roomId: string | undefined,
  ready: boolean,
  onError: (e: unknown) => void,
) {
  const [room, setRoom] = useState<RoomView>();
  const [joinAttempt, setJoinAttempt] = useState(false);
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const socket = useRef<Socket>();
  const current = useRef<RoomView>();
  const desiredRoom = useRef(roomId);
  desiredRoom.current = roomId;
  const accept = useCallback((view: RoomView) => {
    if (view.id !== desiredRoom.current) return;
    if (
      current.current?.id === view.id &&
      (view.revision < current.current.revision ||
        (view.revision === current.current.revision && view.serverNow < current.current.serverNow))
    )
      return;
    current.current = view;
    setRoom(view);
  }, []);
  useEffect(() => {
    current.current = undefined;
    setRoom(undefined);
    setJoinAttempt(false);
    setConnected(false);
    if (!roomId || !ready) return;
    let cancelled = false;
    void api<RoomView>(`/api/rooms/${roomId}`)
      .then((view) => {
        if (!cancelled) accept(view);
      })
      .catch(() => {
        if (!cancelled) setJoinAttempt(true);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, ready, accept]);
  useEffect(() => {
    if (!roomId || !room?.selfId || room.closed || room.selfStatus === 'denied') return;
    const client = connectRoom(roomId);
    let active = true;
    let refreshing = false;
    const samples: { rtt: number; offset: number }[] = [];
    const calibrate = async () => {
      for (let n = 0; n < 5 && active && client.connected; n++) {
        const sent = Date.now();
        try {
          const result = await emit<{ serverNow: number }>(client, 'clock', {}),
            received = Date.now();
          samples.push({ rtt: received - sent, offset: result.serverNow - (sent + received) / 2 });
          samples.sort((a, b) => a.rtt - b.rtt);
          samples.splice(5);
          if (active)
            setClockOffset(
              samples.slice(0, 3).reduce((sum, v) => sum + v.offset, 0) /
                Math.min(3, samples.length),
            );
        } catch {
          break;
        }
      }
    };
    client.on('connect', () => {
      void calibrate();
    });
    const clockTimer = setInterval(() => {
      void calibrate();
    }, 30000);
    socket.current = client;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const view = await api<RoomView>(`/api/rooms/${roomId}`);
        if (active) accept(view);
      } catch {
        // A transport failure does not by itself revoke room membership.
      } finally {
        refreshing = false;
      }
    };
    client.on('snapshot', (view) => {
      accept(view);
      setConnected(client.connected);
    });
    client.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') void refresh();
    });
    client.on('connect_error', (e) => {
      setConnected(false);
      // Approval can be rejected or the room ended while the handshake is in flight.
      // Fetch the final state even when this socket never received a snapshot.
      void refresh();
      onError(e);
    });
    client.on('revoked', () => {
      setConnected(false);
      current.current = undefined;
      setRoom(undefined);
      setJoinAttempt(true);
      onError(new Error('你已离开放映室，邀请可能已经失效'));
    });
    const tick = setInterval(() => {
      if (client.connected)
        void emit<RoomView>(client, 'heartbeat', {}).then(accept).catch(onError);
    }, 15000);
    return () => {
      active = false;
      clearInterval(clockTimer);
      clearInterval(tick);
      client.disconnect();
      if (socket.current === client) socket.current = undefined;
      setConnected(false);
    };
  }, [roomId, room?.selfId, room?.closed, room?.selfStatus, accept, onError]);
  const control = useCallback(
    async (value: PlaybackCommand) => {
      if (!current.current) throw new Error('房间尚未就绪');
      const updated = await command(socket.current, current.current, value);
      accept(updated);
      return updated;
    },
    [accept],
  );
  const message = useCallback(
    async (text?: string) => {
      accept(
        await emit<RoomView>(
          socket.current,
          text === undefined ? 'pause-request' : 'chat',
          text === undefined ? {} : { text },
        ),
      );
    },
    [accept],
  );
  const manage = useCallback(
    async (
      action: 'approve' | 'deny' | 'kick' | 'transfer' | 'rotate' | 'end',
      target?: string,
    ) => {
      if (!roomId) throw new Error('房间尚未就绪');
      const data = await api<{ room: RoomView; invite?: string }>(`/api/rooms/${roomId}/manage`, {
        action,
        ...(target ? { target } : {}),
      });
      accept(data.room);
      return data;
    },
    [roomId, accept],
  );
  const retry = useCallback(() => {
    if (socket.current?.connected) {
      setConnected(false);
      void emit<RoomView>(socket.current, 'heartbeat', {})
        .then((view) => {
          accept(view);
          setConnected(true);
        })
        .catch(onError);
    } else socket.current?.connect();
  }, [accept, onError]);
  const report = useCallback(
    async (state: ViewingState, duration?: number) => {
      const view = current.current;
      if (!view) return;
      accept(
        await emit<RoomView>(socket.current, 'viewing', {
          epoch: view.mediaEpoch,
          state,
          ...(duration === undefined ? {} : { duration }),
        }),
      );
    },
    [accept],
  );
  return {
    room,
    current,
    socket,
    accept,
    joinAttempt,
    connected,
    control,
    message,
    manage,
    retry,
    clockOffset,
    report,
  };
}
