(() => {
  if (globalThis.__interludePlayer) return;
  globalThis.__interludePlayer = true;
  const panel = document.createElement('div');
  // Shadow DOM keeps our controls independent of each platform's CSS.
  panel.style.cssText = 'position:fixed;left:16px;bottom:18px;z-index:2147483647';
  const root = panel.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>:host{all:initial}section{max-width:290px;padding:14px;border-radius:12px;background:#181a1b;color:#f7f6f2;box-shadow:0 4px 24px #0006;font:14px/1.5 system-ui}button{min-height:44px;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;background:#f7f6f2;color:#181a1b}button:focus-visible{outline:3px solid #dcaa62}p{margin:8px 0}</style><section><strong>幕间 · 网站同步</strong><p role="status">请先完成登录、广告并进入正片。</p><button>我已进入正片，开启同步</button></section>';
  document.documentElement.append(panel);
  const button = root.querySelector('button'),
    label = root.querySelector('p');
  let enabled = false,
    video,
    duration = 0,
    busy = false,
    status = '等待正片确认',
    lastEpoch,
    lastUrl,
    lastRevision;
  function stop(text = '同步已停止；进入同一集正片后再开启。') {
    if (enabled) video?.pause();
    enabled = false;
    status = text;
    label.textContent = text;
    button.textContent = '我已进入正片，开启同步';
  }
  function samePage(url) {
    const u = new URL(url);
    return (
      location.origin === u.origin &&
      location.pathname.replace(/\/$/, '') === u.pathname.replace(/\/$/, '') &&
      (new URLSearchParams(location.search).get('p') || '1') === (u.searchParams.get('p') || '1')
    );
  }
  button.onclick = () => {
    if (enabled) {
      stop();
      return;
    }
    const videos = [...document.querySelectorAll('video')].filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width > 100 && r.height > 80 && Number.isFinite(v.duration) && v.duration > 0;
    });
    if (videos.length !== 1) {
      label.textContent = '未找到唯一可控制的正片播放器。请手动对齐；不支持跨域内嵌或封闭播放器。';
      return;
    }
    video = videos[0];
    duration = video.duration;
    enabled = true;
    lastEpoch = undefined;
    lastUrl = undefined;
    lastRevision = undefined;
    button.textContent = '停止同步（广告 / 切集时使用）';
    tick();
  };
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'poll', status });
      if (!enabled) return;
      const s = result?.snapshot;
      if (!s) {
        stop('房间连接中断或同步已断开，影片已暂停。请回到幕间检查。');
        return;
      }
      if (
        !samePage(s.url) ||
        (lastEpoch !== undefined && (lastEpoch !== s.epoch || lastUrl !== s.url))
      ) {
        stop('影片或媒体代次已变化，请重新打开房间当前视频。');
        return;
      }
      if (
        !video.isConnected ||
        !Number.isFinite(video.duration) ||
        Math.abs(video.duration - duration) > 2
      ) {
        stop('播放器或时长已变化。请确认进入正片后重新开启。');
        return;
      }
      lastEpoch = s.epoch;
      lastUrl = s.url;
      if (s.position >= video.duration) {
        stop('房间时间超出本片长度，请房主重新对齐时间。');
        return;
      }
      if (video.readyState < 2 || video.seeking) {
        status = '播放器缓冲中，尚未对齐';
        label.textContent = status;
        return;
      }
      const target = Math.min(
        video.duration,
        s.position + (!s.paused ? Math.min(5, result.age / 1000) : 0),
      );
      if (
        Math.abs(video.currentTime - target) >
        (s.paused || s.revision !== lastRevision ? 0.15 : 1.2)
      )
        video.currentTime = target;
      if (s.paused) video.pause();
      else if (video.paused) await video.play();
      lastRevision = s.revision;
      status = s.paused ? '同步开启 · 房间已暂停' : '同步开启 · 按房间时间播放';
      label.textContent = status;
    } catch {
      if (enabled) stop('自动播放被阻止或扩展连接丢失。请点击官方播放器后重新开启同步。');
    } finally {
      busy = false;
    }
  }
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'stop') stop('同步已断开。');
  });
  setInterval(tick, 1000);
})();
