import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { RoomView, PlaybackCommand } from '../../shared/protocol';
import { LocalSource, SourceError, type SourceInfo } from '../media/LocalSource';
import { readSubtitles } from '../media/subtitles';
import { defaultSubtitleSettings, type SubtitleSettings } from '../media/subtitleLayout';
import { matchingResume, readResume, saveResume } from '../media/resume';
export type Preflight = {
  phase: 'idle' | 'checking' | 'committing' | 'ready' | 'compatibility' | 'error';
  name?: string;
  error?: string;
};
export function useLocalFilm(options: {
  room?: RoomView;
  connected: boolean;
  stage: RefObject<HTMLDivElement>;
  volume: number;
  control: (c: PlaybackCommand) => Promise<RoomView>;
  onError: (e: unknown) => void;
}) {
  const committing = useRef(0);
  const latest = useRef(options);
  latest.current = options;
  const source = useRef<LocalSource>(),
    candidate = useRef<LocalSource>(),
    generation = useRef(0),
    epoch = useRef(-1),
    file = useRef<File>(),
    retryFile = useRef<File>();
  const [info, setInfo] = useState<SourceInfo>(),
    [preflight, setPreflight] = useState<Preflight>({ phase: 'idle' }),
    [subtitleName, setSubtitleName] = useState(''),
    [settings, setSettings] = useState(defaultSubtitleSettings),
    [resume, setResume] = useState<number>();
  const clear = useCallback(() => {
    generation.current++;
    committing.current = 0;
    candidate.current?.dispose();
    source.current?.dispose();
    candidate.current = undefined;
    source.current = undefined;
    file.current = undefined;
    retryFile.current = undefined;
    setInfo(undefined);
    setPreflight({ phase: 'idle' });
    setSubtitleName('');
    setSettings(defaultSubtitleSettings);
    setResume(undefined);
  }, []);
  useEffect(() => clear, [options.room?.id, clear]);
  useEffect(() => {
    const r = options.room;
    if (
      r &&
      (r.closed ||
        r.selfStatus !== 'approved' ||
        r.playback.kind === 'website' ||
        (source.current && epoch.current !== r.mediaEpoch && !committing.current))
    )
      clear();
  }, [options.room?.mediaEpoch, options.room?.closed, options.room?.selfStatus, clear]);
  useEffect(() => {
    if (source.current) source.current.element.volume = options.volume;
  }, [options.volume, info]);
  useEffect(() => {
    const timer = setInterval(() => {
      const r = latest.current.room,
        v = source.current?.element;
      if (r && file.current && v)
        saveResume(r.id, file.current, info?.duration || v.duration, v.currentTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [info]);
  const cancel = useCallback(() => {
    generation.current++;
    candidate.current?.dispose();
    candidate.current = undefined;
    setPreflight({ phase: source.current ? 'ready' : 'idle', name: file.current?.name });
  }, []);
  const select = useCallback(async (next?: File, convert = false) => {
    if (!next) return;
    const opt = latest.current,
      r = opt.room;
    if (!r || !opt.connected) throw new Error('请等待房间连接恢复');
    const host = r.selfId === r.hostId;
    if (!host && r.playback.kind !== 'local') throw new Error('请等待房主选择本地影片');
    const id = ++generation.current;
    retryFile.current = next;
    candidate.current?.dispose();
    source.current?.pause();
    const prepared = new LocalSource((e) => {
      if (source.current === prepared) {
        prepared.pause();
        latest.current.onError(e);
      }
    });
    candidate.current = prepared;
    setPreflight({ phase: 'checking', name: next.name });
    try {
      if (host && source.current) await opt.control({ kind: 'pause' });
      const metadata = await prepared.prepare(next, convert);
      const valid = (acceptedEpoch = r.mediaEpoch) =>
        id === generation.current &&
        latest.current.room?.id === r.id &&
        latest.current.room?.selfStatus === 'approved' &&
        latest.current.room?.hostId === r.hostId &&
        (latest.current.room?.mediaEpoch === r.mediaEpoch ||
          latest.current.room?.mediaEpoch === acceptedEpoch);
      if (!valid()) {
        prepared.dispose();
        return;
      }
      if (!host && Math.abs(metadata.duration - r.playback.duration) > 1)
        throw new Error(
          `影片时长相差 ${Math.abs(metadata.duration - r.playback.duration).toFixed(1)} 秒，请选择同一剪辑版本`,
        );
      committing.current = id;
      setPreflight({ phase: 'committing', name: next.name });
      const view = host
        ? await opt.control({ kind: 'source', title: '本地影片', duration: metadata.duration })
        : latest.current.room!;
      if (!valid(view.mediaEpoch)) {
        prepared.dispose();
        return;
      }
      source.current?.dispose();
      epoch.current = view.mediaEpoch;
      prepared.mount(opt.stage.current!, 1080);
      source.current = prepared;
      candidate.current = undefined;
      file.current = next;
      prepared.element.volume = latest.current.volume;
      prepared.element.addEventListener('ended', () => {
        if (
          source.current === prepared &&
          latest.current.room?.selfId === latest.current.room?.hostId
        )
          void latest.current.control({ kind: 'ended' }).catch(latest.current.onError);
      });
      setInfo(metadata);
      setSubtitleName('');
      setSettings(defaultSubtitleSettings);
      setResume(host ? matchingResume(readResume(r.id), next, metadata.duration) : undefined);
      setPreflight({ phase: 'ready', name: next.name });
    } catch (e) {
      prepared.dispose();
      if (id !== generation.current) return;
      candidate.current = undefined;
      setPreflight({
        phase: !convert && e instanceof SourceError ? 'compatibility' : 'error',
        name: next.name,
        error: e instanceof Error ? e.message : '影片准备失败',
      });
    } finally {
      if (committing.current === id) committing.current = 0;
    }
  }, []);
  const retry = useCallback((convert = false) => select(retryFile.current, convert), [select]);
  const chooseResume = useCallback(
    async (yes: boolean) => {
      if (yes && resume !== undefined) {
        const r = await latest.current.control({ kind: 'seek', position: resume });
        source.current?.seek(r.playback.position);
      }
      setResume(undefined);
    },
    [resume],
  );
  const loadSubtitle = useCallback(async (next?: File) => {
    if (!next || !source.current) return;
    const owner = source.current,
      cues = await readSubtitles(next);
    if (source.current !== owner) return;
    owner.setSubtitles(cues);
    setSubtitleName(next.name);
  }, []);
  const changeSettings = useCallback((v: SubtitleSettings) => {
    source.current?.setSubtitleSettings(v);
    setSettings(v);
  }, []);
  const clearSubtitles = useCallback(() => {
    source.current?.setSubtitles([]);
    setSubtitleName('');
  }, []);
  return {
    source,
    info,
    preflight,
    select,
    retry,
    cancel,
    clear,
    resume,
    chooseResume,
    subtitleName,
    settings,
    loadSubtitle,
    changeSettings,
    clearSubtitles,
  };
}
