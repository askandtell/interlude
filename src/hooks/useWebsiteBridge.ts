import { useEffect } from 'react';
import type { RoomView } from '../../shared/protocol';

/** The extension receives only a sanitized playback snapshot, never room credentials. */
export function useWebsiteBridge(room: RoomView | undefined, connected: boolean) {
  useEffect(() => {
    const receivedAt = Date.now();
    function request(e: MessageEvent) {
      if (
        e.source !== window ||
        e.origin !== location.origin ||
        e.data?.channel !== 'interlude-extension-request'
      )
        return;
      const allowed =
        connected &&
        room &&
        !room.closed &&
        room.selfStatus === 'approved' &&
        room.playback.website;
      window.postMessage(
        {
          channel: 'interlude-extension-snapshot',
          snapshot: allowed
            ? {
                roomId: room.id,
                epoch: room.mediaEpoch,
                revision: room.revision,
                url: room.playback.website!.url,
                paused: room.playback.paused || !room.playback.available,
                position: Math.min(
                  room.playback.duration,
                  room.playback.position +
                    (!room.playback.paused
                      ? Math.max(
                          0,
                          room.serverNow - room.playback.updatedAt + Date.now() - receivedAt,
                        ) / 1000
                      : 0),
                ),
              }
            : null,
        },
        location.origin,
      );
    }
    window.addEventListener('message', request);
    return () => window.removeEventListener('message', request);
  }, [room, connected]);
}
