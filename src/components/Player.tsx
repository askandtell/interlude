import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, Popover, SegmentedControl, Slider } from '@mantine/core';
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconVolume,
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
import type { useTogetherPlayback } from '../hooks/useTogetherPlayback';
import { clock } from '../ui';

type Film = ReturnType<typeof useLocalFilm>;
type Connection = ReturnType<typeof useTogetherPlayback>;
interface Props {
  room: RoomView;
  host: boolean;
  connected: boolean;
  film: Film;
  playback: Connection;
  stage: RefObject<HTMLDivElement>;
  time: number;
  volume: number;
  onVolume: (n: number) => void;
  control: (c: PlaybackCommand) => Promise<unknown>;
  onSelect: () => void;
  onSubtitle: () => void;
  onStart: () => Promise<void>;
  onChat: () => void;
  run: (p: Promise<unknown>) => void;
  onTime: (n: number) => void;
}
export function Player(p: Props) {
  const { room, host, film, playback, connected } = p;
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
    isConnected = playback.active;
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
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => setConfirmed(false), [film.info, room.mediaEpoch]);
  const playLabel = host
    ? isConnected && !room.playback.paused
      ? '暂停放映'
      : '开始放映'
    : '加入一起看';
  const stateLabel = !connected
    ? '控制连接中断'
    : playback.blocked
      ? '点击继续观看'
      : !film.info
        ? '请先选择自己的影片'
        : !isConnected
          ? '已准备 · 等待加入'
          : room.playback.paused
            ? '影片已暂停'
            : host
              ? '正在放映'
              : '正在观看';
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
          className={`screen ${film.info ? 'has-source' : ''}`}
          ref={p.stage}
          onDragOver={(e) => {
            if (host || room.playback.kind === 'local') {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if ((host || room.playback.kind === 'local') && !busy)
              p.run(film.select(e.dataTransfer.files[0]));
          }}
        >
          {!film.info && !preparing && (
            <div className="screen-empty">
              <div className="file-drop">
                <IconFile size={38} />
                <h2>{host ? '选择本地影片' : '选择自己的影片'}</h2>
                <p>
                  {host
                    ? '每个人使用自己的文件，一起看只同步播放。'
                    : room.playback.kind === 'local'
                      ? '请选择同一部、同一剪辑版本的影片。'
                      : '等待房主选择影片。'}
                </p>
                <button
                  className="light-button"
                  disabled={!connected || (!host && room.playback.kind !== 'local')}
                  onClick={p.onSelect}
                >
                  {host ? '选择本地影片' : '选择自己的影片'}
                </button>
                <small>影片不会发送给其他成员</small>
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
          {playback.blocked && (
            <button className="autoplay-prompt light-button" onClick={() => p.run(p.onStart())}>
              点击继续观看
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
                  !film.info ||
                  (host && film.resume !== undefined) ||
                  (!host && !confirmed) ||
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
              {(host || room.playback.kind === 'local') && (
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
                    <>
                      <p className="muted">字幕只显示在你的设备上。</p>
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
                  </div>
                </Popover.Dropdown>
              </Popover>
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
      {['error', 'compatibility'].includes(film.preflight.phase) && (
        <div className="preflight-error" role="alert" ref={errorPanel}>
          <strong>
            {film.preflight.phase === 'compatibility'
              ? '此影片需要兼容处理'
              : '这部影片暂时无法放映'}
          </strong>
          <p>{film.preflight.error}</p>
          <div>
            {film.preflight.reload ? (
              <button className="secondary-button" onClick={() => location.reload()}>
                <IconRefresh size={16} /> 刷新页面
              </button>
            ) : (
              <>
                <button className="secondary-button" onClick={() => p.run(film.retry())}>
                  <IconRefresh size={16} /> 重试
                </button>
                <button className="secondary-button" onClick={() => p.run(film.retry(true))}>
                  尝试兼容转换
                </button>
              </>
            )}
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
        <span>
          {host ? '保持页面打开；断线后需点击继续观看' : '进度由放映者控制 · 音量只对自己生效'}
        </span>
        <span>每个人都需要自己的影片文件</span>
      </div>
      {film.info && !host && !isConnected && (
        <div className="file-confirmation">
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                playback.report(e.target.checked ? 'ready' : 'not-ready');
              }}
            />{' '}
            这是同一部、同一剪辑版本的影片
          </label>
          <span>
            时长差 {Math.abs(film.info.duration - room.playback.duration).toFixed(2)}{' '}
            秒；相同时长不代表内容相同。
          </span>
        </div>
      )}
    </section>
  );
}
