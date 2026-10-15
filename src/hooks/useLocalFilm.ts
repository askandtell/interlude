import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PlaybackCommand, RoomView } from '../../shared/protocol';
import { LocalSource, SourceError, type SourceInfo } from '../media/LocalSource';
import { matchingResume, readResume, saveResume } from '../media/resume';
import { defaultSubtitleSettings, type SubtitleSettings } from '../media/subtitleLayout';
import { readSubtitles } from '../media/subtitles';

export type Preflight = {
  phase: 'idle' | 'checking' | 'committing' | 'ready' | 'compatibility' | 'error';
  name?: string;
  error?: string;
};
interface Options {
  roomId?: string;
  host: boolean;
  connected: boolean;
  stage: RefObject<HTMLDivElement>;
  control: (command: PlaybackCommand) => Promise<RoomView>;
  beforeCommit: () => Promise<void>;
  quality: 720 | 1080;
  volume: number;
  onError: (e: unknown) => void;
}
export function useLocalFilm(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const source = useRef<LocalSource>(),
    candidate = useRef<LocalSource>(),
    generation = useRef(0),
    file = useRef<File>(),
    retryFile = useRef<File>();
  const resumePending = useRef<number>();
  const retryMode = useRef(false);
  const [info, setInfo] = useState<SourceInfo>(),
    [preflight, setPreflight] = useState<Preflight>({ phase: 'idle' });
  const [resume, setResume] = useState<number>(),
    [subtitleName, setSubtitleName] = useState(''),
    [settings, setSettings] = useState(defaultSubtitleSettings);
  const clear = useCallback(() => {
    generation.current++;
    candidate.current?.dispose();
    candidate.current = undefined;
    source.current?.dispose();
    source.current = undefined;
    file.current = undefined;
    retryFile.current = undefined;
    resumePending.current = undefined;
    setInfo(undefined);
    setSubtitleName('');
    setResume(undefined);
    setPreflight({ phase: 'idle' });
    setSettings(defaultSubtitleSettings);
  }, []);
  useEffect(() => clear, [options.roomId, clear]);
  useEffect(() => {
    if (!options.host) clear();
  }, [options.host, clear]);
  useEffect(() => {
    if (source.current) source.current.element.volume = options.volume;
  }, [options.volume]);
  useEffect(() => {
    const timer = setInterval(() => {
      const opt = latest.current,
        video = source.current?.element;
      if (
        opt.host &&
        opt.roomId &&
        file.current &&
        video &&
        resumePending.current === undefined &&
        Number.isFinite(video.currentTime)
      )
        saveResume(opt.roomId, file.current, info?.duration || video.duration, video.currentTime);
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
    const opt = latest.current;
    if (!opt.host || !opt.connected) {
      opt.onError(new Error('请等待房间连接恢复后选片'));
      return;
    }
    const id = ++generation.current;
    retryMode.current = convert;
    retryFile.current = next;
    candidate.current?.dispose();
    const prepared = new LocalSource((e) => {
      if (source.current !== prepared) return;
      prepared.pause();
      latest.current.onError(e);
      void latest.current.control({ kind: 'stop' }).catch(latest.current.onError);
    });
    candidate.current = prepared;
    setPreflight({ phase: 'checking', name: next.name });
    try {
      if (source.current) {
        source.current.pause();
        await opt.control({ kind: 'pause' });
      }
      const metadata = await prepared.prepare(next, convert);
      if (
        id !== generation.current ||
        !latest.current.host ||
        opt.roomId !== latest.current.roomId
      ) {
        prepared.dispose();
        return;
      }
      const position = opt.roomId
        ? matchingResume(readResume(opt.roomId), next, metadata.duration)
        : undefined;
      setPreflight({ phase: 'committing', name: next.name });
      await opt.control({ kind: 'source', title: next.name, duration: metadata.duration });
      if (
        id !== generation.current ||
        !latest.current.host ||
        opt.roomId !== latest.current.roomId
      ) {
        prepared.dispose();
        return;
      }
      await latest.current.beforeCommit();
      if (id !== generation.current || !latest.current.host) {
        prepared.dispose();
        return;
      }
      source.current?.dispose();
      prepared.mount(opt.stage.current!, opt.quality);
      source.current = prepared;
      candidate.current = undefined;
      file.current = next;
      prepared.element.volume = latest.current.volume;
      prepared.element.addEventListener('ended', () => {
        if (source.current === prepared)
          void latest.current.control({ kind: 'ended' }).catch(latest.current.onError);
      });
      setInfo(metadata);
      setSubtitleName('');
      setSettings(defaultSubtitleSettings);
      resumePending.current = position;
      setResume(position);
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
    }
  }, []);
  const retry = useCallback(
    (convert?: boolean) => select(retryFile.current, convert ?? retryMode.current),
    [select],
  );
  const chooseResume = useCallback(async (continuePlaying: boolean) => {
    if (continuePlaying && resumePending.current !== undefined) {
      const view = await latest.current.control({ kind: 'seek', position: resumePending.current });
      source.current?.seek(view.playback.position);
    }
    resumePending.current = undefined;
    setResume(undefined);
  }, []);
  const loadSubtitle = useCallback(async (next?: File) => {
    if (!next || !source.current) return;
    const owner = source.current,
      cues = await readSubtitles(next);
    if (owner !== source.current) return;
    owner.setSubtitles(cues);
    setSubtitleName(next.name);
  }, []);
  const changeSettings = useCallback((next: SubtitleSettings) => {
    source.current?.setSubtitleSettings(next);
    setSettings(next);
  }, []);
  const clearSubtitles = useCallback(() => {
    source.current?.setSubtitles([]);
    setSubtitleName('');
  }, []);
  return {
    source,
    info,
    preflight,
    resume,
    select,
    retry,
    cancel,
    clear,
    chooseResume,
    subtitleName,
    settings,
    loadSubtitle,
    changeSettings,
    clearSubtitles,
  };
}
