import { useEffect, useState, useMemo } from 'react';
import type { PlaybackCommand, RoomView } from '../../shared/protocol';
import { clock } from '../ui';

export function WebsiteRoom({
  room,
  connected,
  control,
  local,
  change,
  mic,
  onMic,
  onChat,
  run,
}: {
  room: RoomView;
  connected: boolean;
  control: (c: PlaybackCommand) => Promise<unknown>;
  local: () => void;
  change: () => void;
  mic: boolean;
  onMic: () => Promise<void>;
  onChat: () => void;
  run: (p: Promise<unknown>) => void;
}) {
  const [seconds, setSeconds] = useState('0'),
    [now, setNow] = useState(Date.now()),
    [extension, setExtension] = useState('尚未连接同步扩展');
  const receivedAt = useMemo(() => Date.now(), [room]);
  const host = room.selfId === room.hostId;
  const source = room.playback.website!;
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    let last = 0;
    function message(e: MessageEvent) {
      if (
        e.source !== window ||
        e.origin !== location.origin ||
        e.data?.channel !== 'interlude-extension-status'
      )
        return;
      if (typeof e.data.text === 'string') {
        last = Date.now();
        setExtension(e.data.text.slice(0, 160));
      }
    }
    window.addEventListener('message', message);
    const check = setInterval(() => {
      if (Date.now() - last > 6000) setExtension('尚未连接同步扩展');
    }, 2000);
    return () => {
      clearInterval(check);
      window.removeEventListener('message', message);
    };
  }, []);
  const position = Math.min(
    room.playback.duration,
    room.playback.position +
      (!room.playback.paused && connected
        ? Math.max(0, room.serverNow - room.playback.updatedAt + now - receivedAt) / 1000
        : 0),
  );
  return (
    <section className="website-room player-column">
      <div className="website-stage">
        <span className="website-eyebrow">网站一起看 · 实验性</span>
        <h2>{source.provider}</h2>
        <p>影片在官方网页播放。每个人使用自己的账号和观看权限，幕间只同步时间与操作。</p>
        <a className="light-button" href={source.url} target="_blank" rel="noopener noreferrer">
          打开官方播放页 ↗
        </a>
        <div className="website-clock" aria-label="房间目标时间">
          {clock(position)}
        </div>
        <span>{room.playback.paused ? '房间时间已暂停' : '房间时间正在前进'}</span>
        <p role="status" className="website-status">
          {extension}
        </p>
      </div>
      <div className="website-controls">
        {host ? (
          <>
            <button
              className="light-button"
              disabled={!connected}
              onClick={() => run(control({ kind: room.playback.paused ? 'play' : 'pause' }))}
            >
              {room.playback.paused ? '一起播放' : '一起暂停'}
            </button>
            <label>
              对齐到（秒）
              <input
                type="number"
                min="0"
                max="864000"
                step="0.1"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={
                !connected ||
                seconds.trim() === '' ||
                !Number.isFinite(Number(seconds)) ||
                Number(seconds) < 0 ||
                Number(seconds) > 864000
              }
              onClick={() => run(control({ kind: 'seek', position: Number(seconds) }))}
            >
              设置时间
            </button>
            <button className="text-button" disabled={!connected} onClick={local}>
              改放本地影片
            </button>
            <button className="text-button" disabled={!connected} onClick={change}>
              更换网站影片
            </button>
          </>
        ) : (
          <span>播放和跳转由房主控制；无扩展时请按房间时间手动对齐。</span>
        )}
        <button className="secondary-button" disabled={!connected} onClick={() => run(onMic())}>
          {mic ? '关闭麦克风' : '开启麦克风'}
        </button>
        <button className="secondary-button" onClick={onChat}>
          聊天与成员
        </button>
      </div>
      <details className="website-help">
        <summary>连接自动同步与处理广告</summary>
        <ol>
          <li>按项目说明安装 extensions/watch-sync 中的 Chrome／Edge 扩展。</li>
          <li>在本房间点击扩展的“连接这个房间”，再点击“打开影片并授权”。</li>
          <li>
            在官方网页完成登录、付费或广告，点击页面左下角“我已进入正片，开启同步”。保持房间页打开。
          </li>
        </ol>
        <p>
          在幕间控制播放和时间。自动同步不会反向采集网站操作；在网站上拖动后，请房主在这里设置对应时间。广告、试看、切集或播放器更换时先停止同步，进入同一集正片后再开启。自动连播和跨设备播放未支持。
        </p>
        <p>
          扩展不下载视频、不共享账号、不绕过广告、会员或
          DRM。平台适配尚未经四站真实账号完整验收。没有扩展时仍可语音聊天、查看房间时间并手动同步。
        </p>
      </details>
    </section>
  );
}
