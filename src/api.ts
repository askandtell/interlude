import type { Ack, CommandEnvelope, PlaybackCommand, RoomView } from '../shared/protocol';
import { io, type Socket } from 'socket.io-client';
let csrf = '';
let sessionPromise: Promise<void> | undefined;
export function session() {
  return (sessionPromise ??= (async () => {
    const response = await fetch('/api/session', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('无法建立会话');
    const data = await response.json();
    csrf = data.csrf;
  })().catch((error) => {
    sessionPromise = undefined;
    throw error;
  }));
}
export async function api<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || '服务暂时不可用，请重试');
  return body as T;
}
export function connectRoom(roomId: string) {
  return io({
    transports: ['websocket'],
    auth: { roomId, csrf },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
}
export function emit<T>(socket: Socket | undefined, event: string, data: unknown): Promise<T> {
  if (!socket?.connected) return Promise.reject(new Error('连接已断开，正在重新连接'));
  return new Promise((resolve, reject) =>
    socket.timeout(10000).emit(event, data, (timeout: Error | null, response: Ack<T>) => {
      if (timeout) reject(new Error('操作超时，请重试'));
      else if (!response.ok)
        reject(Object.assign(new Error(response.error), { code: response.code }));
      else resolve(response.value as T);
    }),
  );
}
export async function command(socket: Socket | undefined, room: RoomView, value: PlaybackCommand) {
  const envelope: CommandEnvelope = {
    id: crypto.randomUUID(),
    roomId: room.id,
    epoch: room.mediaEpoch,
    revision: room.revision,
    command: value,
  };
  try {
    return await emit<RoomView>(socket, 'command', envelope);
  } catch (e) {
    if ((e as { code?: string }).code !== 'STALE_STATE') throw e;
    const latest = await api<RoomView>(`/api/rooms/${room.id}`);
    if (latest.mediaEpoch !== room.mediaEpoch) throw e;
    return emit<RoomView>(socket, 'command', { ...envelope, revision: latest.revision });
  }
}
