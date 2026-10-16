// Ephemeral pairing only. No cookies, account APIs, media requests or external network calls.
const hosts = new Set(['www.bilibili.com', 'v.youku.com', 'www.iqiyi.com', 'v.qq.com']);
function valid(s) {
  try {
    const u = new URL(s.url);
    return (
      u.protocol === 'https:' &&
      hosts.has(u.hostname) &&
      !u.hash &&
      [...u.searchParams.keys()].every((k) => k === 'p') &&
      ((u.hostname === 'www.bilibili.com' &&
        /^\/video\/(BV[a-zA-Z0-9]+|av\d+)\/?$/.test(u.pathname)) ||
        (u.hostname === 'v.youku.com' && /^\/v_show\/id_[a-zA-Z0-9=]+\.html$/.test(u.pathname)) ||
        (u.hostname === 'www.iqiyi.com' && /^\/v_[a-zA-Z0-9]+\.html$/.test(u.pathname)) ||
        (u.hostname === 'v.qq.com' &&
          /^\/x\/(cover\/[a-zA-Z0-9]+(\/[a-zA-Z0-9]+)?|page\/[a-zA-Z0-9]+)\.html$/.test(
            u.pathname,
          ))) &&
      !u.username &&
      !u.password &&
      !u.port &&
      typeof s.roomId === 'string' &&
      Number.isInteger(s.epoch) &&
      Number.isInteger(s.revision) &&
      Number.isFinite(s.position) &&
      s.position >= 0 &&
      s.position <= 864000 &&
      typeof s.paused === 'boolean'
    );
  } catch {
    return false;
  }
}
async function handle(m, sender) {
  const data = await chrome.storage.session.get([
    'pair',
    'snapshot',
    'received',
    'status',
    'playerSeen',
    'confirmed',
  ]);
  const { pair, snapshot, received } = data;
  if (pair && m.type === 'snapshot' && sender.tab?.id === pair?.roomTab) {
    const next = m.snapshot;
    if (!next) {
      await chrome.storage.session.set({ snapshot: null, received: 0 });
      return;
    }
    if (!valid(next) || next.roomId !== pair.roomId) return;
    if (
      snapshot &&
      (next.epoch < snapshot.epoch ||
        (next.epoch === snapshot.epoch && next.revision < snapshot.revision))
    )
      return;
    await chrome.storage.session.set({ snapshot: next, received: Date.now() });
    return;
  }
  if (pair && m.type === 'poll' && sender.tab?.id === pair?.videoTab) {
    if (typeof m.status === 'string')
      await chrome.storage.session.set({
        status: m.status.slice(0, 160),
        playerSeen: Date.now(),
        confirmed: m.enabled === true,
      });
    return {
      snapshot: snapshot && Date.now() - received < 5000 ? snapshot : null,
      age: Date.now() - received,
    };
  }
  if (pair && m.type === 'status' && sender.tab?.id === pair?.roomTab)
    return {
      text: data.status || '扩展已连接 · 等待在官方网页开启同步',
      playerConnected: !!pair.videoTab && Date.now() - (data.playerSeen || 0) < 5000,
      confirmed: data.confirmed === true && Date.now() - (data.playerSeen || 0) < 5000,
    };
  // Only the extension popup can open or unpair tabs.
  if (sender.tab || !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return;
  if (m.type === 'disconnect') {
    if (pair?.videoTab)
      await chrome.tabs.sendMessage(pair.videoTab, { type: 'stop' }).catch(() => {});
    await chrome.storage.session.clear();
    return;
  }
  if (m.type === 'open') {
    if (!pair || !valid(snapshot) || Date.now() - received > 5000)
      return { error: '房间状态已失效，请重新连接。' };
    if (pair.videoTab)
      await chrome.tabs.sendMessage(pair.videoTab, { type: 'stop' }).catch(() => {});
    const tab = await chrome.tabs.create({ url: snapshot.url });
    await chrome.storage.session.set({
      pair: { ...pair, videoTab: tab.id },
      status: '等待正片确认',
    });
    // A cached page can finish before the pairing write above completes.
    const current = await chrome.tabs.get(tab.id);
    if (current.status === 'complete') await injectPlayer(tab.id);
  }
}
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  queue = queue
    .then(() => handle(m, sender))
    .then((v) => reply(v ?? {}))
    .catch(() => reply({ error: '扩展操作失败，请重新连接。' }));
  return true;
});
async function injectPlayer(id) {
  try {
    const tab = await chrome.tabs.get(id),
      host = new URL(tab.url).hostname;
    const adapters = {
      'www.bilibili.com': 'bilibili',
      'v.youku.com': 'youku',
      'www.iqiyi.com': 'iqiyi',
      'v.qq.com': 'tencent',
    };
    if (!adapters[host]) return;
    await chrome.scripting.executeScript({
      target: { tabId: id },
      files: ['adapters/' + adapters[host] + '.js', 'player.js'],
    });
  } catch {
    await chrome.storage.session.set({
      status: '无法连接官方播放器。请检查站点授权，或手动对齐。',
    });
  }
}
chrome.tabs.onUpdated.addListener(async (id, info) => {
  if (info.status !== 'complete') return;
  const { pair } = await chrome.storage.session.get('pair');
  if (id === pair?.videoTab) await injectPlayer(id);
});
chrome.tabs.onRemoved.addListener(async (id) => {
  const { pair } = await chrome.storage.session.get('pair');
  if (pair && id === pair.videoTab) {
    await chrome.storage.session.set({
      pair: { roomTab: pair.roomTab, roomId: pair.roomId },
      status: '官方播放页已关闭，请通过扩展重新打开影片。',
    });
    return;
  }
  if (id === pair?.roomTab) {
    if (pair.videoTab)
      await chrome.tabs.sendMessage(pair.videoTab, { type: 'stop' }).catch(() => {});
    await chrome.storage.session.clear();
  }
});
