import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView, ViewingState, PlaybackCommand } from '../../shared/protocol';
import type { useLocalFilm } from './useLocalFilm';
export function targetPosition(room: RoomView, serverNow: number) {
  const p = room.playback;
  return Math.max(
    0,
    Math.min(p.duration, p.position + (p.paused ? 0 : Math.max(0, serverNow - p.updatedAt) / 1000)),
  );
}
export function correction(error: number) {
  return Math.abs(error) > 0.5 ? 'seek' : Math.abs(error) > 0.15 ? (error > 0 ? 1.03 : 0.97) : 1;
}
export function useTogetherPlayback(
  room: RoomView | undefined,
  connected: boolean,
  film: ReturnType<typeof useLocalFilm>,
  offset: number,
  control: (c: PlaybackCommand) => Promise<RoomView>,
  report: (state: ViewingState, duration?: number) => Promise<void>,
) {
  const [active, setActive] = useState(false),
    [blocked, setBlocked] = useState(false);
  const current = useRef({ room, connected, film, offset, active });
  current.current = { room, connected, film, offset, active };
  const lastReport = useRef('');
  const status = useCallback(
    (s: ViewingState) => {
      if (lastReport.current === s) return;
      lastReport.current = s;
      void report(s, current.current.film.info?.duration).catch(() => {
        lastReport.current = '';
      });
    },
    [report],
  );
  useEffect(() => {
    setActive(false);
    setBlocked(false);
    lastReport.current = '';
    film.source.current?.pause();
    if (film.info && room?.selfId === room?.hostId) status('ready');
  }, [room?.id, room?.mediaEpoch, film.info, status]);
  useEffect(() => {
    if (!connected || room?.closed || room?.selfStatus !== 'approved') {
      setActive(false);
      film.source.current?.pause();
    }
  }, [connected, room?.closed, room?.selfStatus]);
  useEffect(() => {
    const v = film.source.current?.element;
    if (!v) return;
    const waiting = () => {
      if (current.current.active) status('buffering');
    };
    const playing = () => {
      if (current.current.active) {
        setBlocked(false);
        status('watching');
      }
    };
    v.addEventListener('waiting', waiting);
    v.addEventListener('playing', playing);
    return () => {
      v.removeEventListener('waiting', waiting);
      v.removeEventListener('playing', playing);
    };
  }, [film.info, status]);
  useEffect(() => {
    let busy = false;
    const sync = () => {
      const { room: r, connected: c, film: f, offset: o, active: a } = current.current,
        v = f.source.current?.element;
      if (!r || !v || !a || !c || r.closed) return;
      if (f.preflight.phase === 'checking' || f.preflight.phase === 'committing') {
        v.pause();
        return;
      }
      const target = targetPosition(r, Date.now() + o),
        delta = target - v.currentTime,
        action = correction(delta);
      if (action === 'seek') f.source.current?.seek(target);
      else if (v.playbackRate !== action) {
        try {
          v.playbackRate = action;
        } catch {
          if (Math.abs(delta) > 0.5) f.source.current?.seek(target);
        }
      }
      if (r.playback.paused) {
        v.pause();
        v.playbackRate = 1;
        status('ready');
      } else if (v.paused && !busy && !v.ended) {
        busy = true;
        void v
          .play()
          .catch(() => {
            setBlocked(true);
            setActive(false);
            status('blocked');
          })
          .finally(() => {
            busy = false;
          });
      }
    };
    const timer = setInterval(sync, 150);
    sync();
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    const v = film.source.current?.element;
    if (v && active && room) {
      film.source.current?.seek(targetPosition(room, Date.now() + offset));
      if (room.playback.paused) v.pause();
    }
  }, [room?.playback.updatedAt, room?.playback.paused]);
  const start = useCallback(async () => {
    const { room: r, film: f, connected: c, offset: o } = current.current,
      v = f.source.current;
    if (!r || !v || !f.info || !c) throw new Error('请先选择自己的影片并恢复连接');
    const valid = () => {
      const next = current.current;
      return (
        next.connected &&
        next.room?.id === r.id &&
        next.room.mediaEpoch === r.mediaEpoch &&
        next.room.selfStatus === 'approved' &&
        !next.room.closed &&
        next.film.source.current === v
      );
    };
    const requireCurrent = () => {
      if (!valid()) {
        v.pause();
        throw new Error('房间状态已变化，请重新加入一起看');
      }
    };
    if (Math.abs(f.info.duration - r.playback.duration) > 1) throw new Error('影片时长不匹配');
    v.seek(targetPosition(r, Date.now() + o));
    try {
      await v.play();
      v.pause();
    } catch {
      setBlocked(true);
      status('blocked');
      throw new Error('播放受阻，请点击继续观看');
    }
    setBlocked(false);
    try {
      requireCurrent();
      await report('ready', f.info.duration);
      requireCurrent();
      if (r.selfId === r.hostId) await control({ kind: r.playback.paused ? 'play' : 'pause' });
      requireCurrent();
      setActive(true);
    } catch (e) {
      v.pause();
      setActive(false);
      throw e;
    }
  }, [control, report, status]);
  return { active, blocked, start, report: status };
}
