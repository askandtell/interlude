import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, Popover, SegmentedControl, Slider } from '@mantine/core';
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconVolume,
  IconMicrophone,
  IconMicrophoneOff,
  IconMessageCircle,
  IconMaximize,
  IconPhotoVideo,
  IconBadgeCc,
  IconFile,
  IconX,
  IconRefresh,
  IconCheck,
} from '@tabler/icons-react';
import type { PlaybackCommand, RoomView } from '../../shared/protocol';
import type { useLocalFilm } from '../hooks/useLocalFilm';
import type { usePlaybackConnection } from '../hooks/usePlaybackConnection';
import { clock } from '../ui';

type Film = ReturnType<typeof useLocalFilm>;
type Connection = ReturnType<typeof usePlaybackConnection>;
interface Props {
  room: RoomView;
  host: boolean;
  connected: boolean;
  film: Film;
  media: Connection;
  stage: RefObject<HTMLDivElement>;
  movie: RefObject<HTMLVideoElement>;
  time: number;
  volume: number;
  onVolume: (n: number) => void;
  control: (c: PlaybackCommand) => Promise<unknown>;
  onSelect: () => void;
  onSubtitle: () => void;
  onStart: () => Promise<void>;
  onMic: () => Promise<void>;
  onChat: () => void;
  run: (p: Promise<unknown>) => void;
  onTime: (n: number) => void;
}
export function Player(p: Props) {
  const { room, host, film, media, connected } = p;
  const shell = useRef<HTMLDivElement>(null),
    seekTimer = useRef<ReturnType<typeof setTimeout>>();
  const seekVersion = useRef(0);
  const [seeking, setSeeking] = useState(false),
    [dragTime, setDragTime] = useState(0),
    [starting, setStarting] = useState(false),
    [subOpen, setSubOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false),
    [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const errorPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (['error', 'compatibility'].includes(film.preflight.phase))
      errorPanel.current?.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
  }, [film.preflight.phase]);
  const preparing = ['checking', 'committing'].includes(film.preflight.phase),
    isConnected = media.state === 'connected';
  const busy = preparing || starting;
  useEffect(
    () => () => {
      clearTimeout(seekTimer.current);
      clearTimeout(hideTimer.current);
    },
    [],
  );
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  function reveal() {
    setControls(true);
    clearTimeout(hideTimer.current);
    if (fullscreen && !room.playback.paused)
      hideTimer.current = setTimeout(() => {
        if (!shell.current?.contains(document.activeElement)) setControls(false);
      }, 3000);
  }
  useEffect(() => {
    if (room.playback.paused || !fullscreen) setControls(true);
    else reveal();
  }, [room.playback.paused, fullscreen]);
  async function start() {
    setStarting(true);
    try {
      if (host && isConnected) await p.control({ kind: room.playback.paused ? 'play' : 'pause' });
      else await p.onStart();
    } finally {
      setStarting(false);
    }
  }
  const playLabel = host
    ? isConnected && !room.playback.paused
      ? '暂停放映'
      : '开始放映'
    : '开始观看';
  const stateLabel = !connected
    ? '控制连接中断'
    : media.state === 'autoplay-blocked'
      ? '需要点击恢复播放'
      : !isConnected
        ? ['connecting', 'reconnecting', 'signalReconnecting'].includes(media.state)
          ? '正在连接媒体'
          : '媒体未连接'
        : host
          ? film.info
            ? room.playback.paused
              ? '影片已暂停'
              : '正在放映'
            : '等待选片'
          : media.hasPicture
            ? room.playback.paused
              ? '影片已暂停'
              : '正在观看'
            : '已连接 · 等待画面';
  return (
    <section className="player-column">
      <div
        className={`player-shell ${fullscreen ? 'is-fullscreen' : ''} ${controls ? '' : 'controls-hidden'}`}
        ref={shell}
        onPointerMove={reveal}
        onPointerDown={reveal}
        onFocusCapture={reveal}
      >
        <div
          className={`screen ${host && film.info ? 'has-source' : ''}`}
          ref={p.stage}
          onDragOver={(e) => {
            if (host) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (host && !busy) p.run(film.select(e.dataTransfer.files[0]));
          }}
        >
          <video
            ref={p.movie}
            playsInline
            autoPlay
            className="remote-movie"
            aria-label="朋友分享的影片"
            style={{ visibility: host ? 'hidden' : 'visible' }}
          />
          {!film.info && host && !preparing && (
            <div className="screen-empty">
              <div className="file-drop">
                <IconFile size={38} stroke={1.25} />
                <h2>选择本地影片</h2>
                <p>或将影片文件拖到此处</p>
                <button className="light-button" onClick={p.onSelect} disabled={!connected}>
                  选择本地影片
                </button>
                <small>格式支持以实际检测为准</small>
              </div>
            </div>
          )}
          {!host && !media.hasPicture && (
            <div className="screen-empty">
              <div className="viewer-wait">
                <IconPlayerPlayFilled size={28} />
                <h2>{isConnected ? '等待放映者的画面' : '加入这场放映'}</h2>
                <p>
                  {room.playback.title
                    ? room.playback.title
                    : room.hostState === 'online'
                      ? '房主正在准备影片'
                      : '等待房主重新连接'}
                </p>
                {isConnected && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      p.run(
                        (async () => {
                          await media.disconnect();
                          await p.onStart();
                        })(),
                      )
                    }
                    disabled={!connected || starting}
                  >
                    重试媒体连接
                  </button>
                )}
                {!isConnected && (
                  <button
                    className="light-button"
                    onClick={() => p.run(start())}
                    disabled={!connected || starting}
                  >
                    开始观看
                  </button>
                )}
              </div>
            </div>
          )}
          {preparing && (
            <div className="preparing-overlay" role="status">
              <span className="loading-ring" />
              <strong>
                {film.preflight.phase === 'committing' ? '正在切换影片' : '正在检测影片'}
              </strong>
              <span>{film.preflight.name}</span>
              {film.preflight.phase === 'checking' && (
                <button className="secondary-button" onClick={film.cancel}>
                  取消检测
                </button>
              )}
            </div>
          )}
          {media.state === 'autoplay-blocked' && (
            <button
              className="autoplay-prompt light-button"
              onClick={() =>
                p.run(
                  (async () => {
                    const t = await media.ensure();
                    await t.resumeAudio();
                  })(),
                )
              }
            >
              点击恢复声音与画面
            </button>
          )}
        </div>
        <div className="transport-bar" onPointerEnter={() => clearTimeout(hideTimer.current)}>
          <div className="timeline">
            <Slider
              thumbLabel="影片进度"
              aria-label="影片进度"
              min={0}
              max={room.playback.duration || 1}
              value={seeking ? dragTime : Math.min(p.time, room.playback.duration || 1)}
              onChange={(value) => {
                setSeeking(true);
                setDragTime(value);
              }}
              onChangeEnd={(value) => {
                setSeeking(true);
                setDragTime(value);
                const version = ++seekVersion.current;
                clearTimeout(seekTimer.current);
                seekTimer.current = setTimeout(
                  () =>
                    p.run(
                      (async () => {
                        try {
                          await p.control({ kind: 'seek', position: value });
                          p.onTime(value);
                        } finally {
                          if (version === seekVersion.current) setSeeking(false);
                        }
                      })(),
                    ),
                  200,
                );
              }}
              disabled={!host || !film.info || !connected || busy}
              size="xs"
              color="gray"
              label={clock}
            />
            <span>
              {clock(seeking ? dragTime : p.time)} <i>/</i>{' '}
              {room.playback.duration ? clock(room.playback.duration) : '--:--'}
            </span>
          </div>
          <div className="transport-controls">
            <div>
              <button
                className="play-button"
                aria-label={!host && isConnected ? '已开始观看' : playLabel}
                title={host ? '放映者控制播放' : '进度由放映者控制'}
                disabled={
                  busy ||
                  !connected ||
                  (host && (!film.info || film.resume !== undefined)) ||
                  (!host && isConnected)
                }
                onClick={() => p.run(start())}
              >
                {!host && isConnected ? (
                  <IconCheck size={20} />
                ) : host && isConnected && !room.playback.paused ? (
                  <IconPlayerPauseFilled size={20} />
                ) : (
                  <IconPlayerPlayFilled size={20} />
                )}
              </button>
              <span className="volume-icon">
                <IconVolume size={19} />
              </span>
              <Slider
                className="volume-slider"
                thumbLabel="电影音量"
                aria-label="电影音量"
                value={p.volume * 100}
                onChange={(v) => p.onVolume(v / 100)}
                size="xs"
                color="gray"
                label={(v) => `${Math.round(v)}%`}
              />
              <span className="player-state">
                <i className={isConnected ? 'status-dot online' : 'status-dot'} />
                {stateLabel}
              </span>
            </div>
            <div>
              {host && (
                <button
                  className="icon-button"
                  aria-label="更换影片"
                  title="更换影片"
                  onClick={p.onSelect}
                  disabled={!connected || busy}
                >
                  <IconPhotoVideo size={20} />
                </button>
              )}
              <Popover
                opened={subOpen}
                onChange={setSubOpen}
                withinPortal={false}
                position="top-end"
                shadow="md"
                width={300}
              >
                <Popover.Target>
                  <button
                    className={`icon-button ${film.subtitleName ? 'active' : ''}`}
                    aria-label="字幕设置"
                    title="字幕设置"
                    onClick={() => setSubOpen(!subOpen)}
                  >
                    <IconBadgeCc size={20} />
                  </button>
                </Popover.Target>
                <Popover.Dropdown>
                  <div className="subtitle-panel">
                    <h3>字幕设置</h3>
                    {host ? (
                      <>
                        <p className="muted">字幕由放映者合成到画面，所有人同步看到。</p>
                        {film.subtitleName ? (
                          <>
                            <div className="subtitle-file">
                              <IconFile size={18} />
                              <span>{film.subtitleName}</span>
                              <button
                                className="icon-button"
                                aria-label="清除字幕"
                                onClick={film.clearSubtitles}
                              >
                                <IconX size={17} />
                              </button>
                            </div>
                            <label className="field-label">字幕大小</label>
                            <SegmentedControl
                              fullWidth
                              value={String(film.settings.scale)}
                              onChange={(value) =>
                                film.changeSettings({
                                  ...film.settings,
                                  scale: Number(value) as 80 | 100 | 120,
                                })
                              }
                              data={['80', '100', '120'].map((v) => ({ value: v, label: `${v}%` }))}
                            />
                            <label className="field-label" htmlFor="subtitle-offset">
                              时间偏移（秒）
                            </label>
                            <input
                              id="subtitle-offset"
                              className="number-input"
                              aria-label="字幕时间偏移"
                              type="number"
                              min={-10}
                              max={10}
                              step={0.1}
                              key={film.subtitleName}
                              defaultValue={film.settings.offset}
                              onBlur={(e) => {
                                e.currentTarget.value = String(film.settings.offset);
                              }}
                              onChange={(e) => {
                                const n = e.currentTarget.valueAsNumber;
                                if (Number.isFinite(n))
                                  film.changeSettings({
                                    ...film.settings,
                                    offset: Math.max(-10, Math.min(10, n)),
                                  });
                              }}
                            />
                            <p className="muted">正数让字幕延后，负数让字幕提前。</p>
                          </>
                        ) : (
                          <p>未载入字幕</p>
                        )}
                        <Button
                          variant="default"
                          fullWidth
                          disabled={!film.info}
                          onClick={p.onSubtitle}
                        >
                          {film.subtitleName ? '替换字幕文件' : '载入 SRT / VTT 字幕'}
                        </Button>
                      </>
                    ) : (
                      <p>字幕由放映者共享。如需调整，请在聊天中联系对方。</p>
                    )}
                  </div>
                </Popover.Dropdown>
              </Popover>
              <button
                className={`icon-button ${media.mic ? 'active' : ''}`}
                aria-label={media.mic ? '关闭麦克风' : '开启麦克风'}
                title={media.mic ? '关闭麦克风' : '开启麦克风'}
                disabled={!connected}
                onClick={() => p.run(p.onMic())}
              >
                {media.mic ? <IconMicrophone size={20} /> : <IconMicrophoneOff size={20} />}
              </button>
              {document.fullscreenEnabled && (
                <button
                  className="icon-button"
                  aria-label={fullscreen ? '退出全屏' : '全屏观看'}
                  title="全屏观看"
                  onClick={() =>
                    p.run(
                      document.fullscreenElement
                        ? document.exitFullscreen()
                        : shell.current!.requestFullscreen(),
                    )
                  }
                >
                  <IconMaximize size={20} />
                </button>
              )}
              <button
                className="icon-button"
                aria-label="显示或隐藏聊天"
                title="聊天与成员"
                onClick={p.onChat}
              >
                <IconMessageCircle size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
      {host && ['error', 'compatibility'].includes(film.preflight.phase) && (
        <div className="preflight-error" role="alert" ref={errorPanel}>
          <strong>
            {film.preflight.phase === 'compatibility'
              ? '此影片需要兼容处理'
              : '这部影片暂时无法放映'}
          </strong>
          <p>{film.preflight.error}</p>
          <div>
            <button className="secondary-button" onClick={() => p.run(film.retry())}>
              <IconRefresh size={16} /> 重试
            </button>
            <button className="secondary-button" onClick={() => p.run(film.retry(true))}>
              尝试兼容转换
            </button>
            <button className="text-button" onClick={p.onSelect}>
              重新选片
            </button>
            {film.info && (
              <button className="text-button" onClick={film.cancel}>
                返回原影片
              </button>
            )}
          </div>
        </div>
      )}
      {host && film.info && (
        <div className="ready-strip">
          <IconFile size={20} />
          <div>
            <strong>{film.info.title}</strong>
            <span>
              {film.info.videoCodec.toUpperCase()} / {film.info.audioCodec.toUpperCase()} ·{' '}
              {film.info.width} × {film.info.height} · {clock(film.info.duration)}
              {film.info.converted ? ' · 兼容处理' : ''}
            </span>
          </div>
          <span className="ready-badge">
            <IconCheck size={14} /> 可播放
          </span>
        </div>
      )}
      {host && film.resume !== undefined && (
        <div className="resume-prompt" role="status">
          <span>
            检测到本次房间的观看位置 <strong>{clock(film.resume)}</strong>，是否继续？
          </span>
          <div>
            <button className="secondary-button" onClick={() => p.run(film.chooseResume(false))}>
              从头开始
            </button>
            <button className="primary-button" onClick={() => p.run(film.chooseResume(true))}>
              从 {clock(film.resume)} 继续
            </button>
          </div>
        </div>
      )}
      <div className="below-screen">
        <span>{host ? '放映期间请保持页面打开' : '进度由放映者控制 · 音量只对自己生效'}</span>
        <span>影片不作为文件上传保存</span>
      </div>
    </section>
  );
}
