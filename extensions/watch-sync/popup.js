const status = document.querySelector('#status');
function show(error) {
  status.textContent = error instanceof Error ? error.message : String(error);
}
document.querySelector('#connect').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const u = new URL(tab.url);
    if (
      !/^\/room\/[\w-]{16,64}$/.test(u.pathname) ||
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))
      )
    )
      throw new Error('请先切换到幕间房间页，再连接。');
    await chrome.runtime.sendMessage({ type: 'disconnect' });
    await chrome.storage.session.set({
      pair: { roomTab: tab.id, roomId: u.pathname.split('/')[2] },
      snapshot: null,
      received: 0,
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['room-bridge.js'] });
    show('房间已连接。稍候再点击“打开影片并授权”。');
  } catch (e) {
    show(e);
  }
};
document.querySelector('#open').onclick = async () => {
  try {
    const { snapshot, received } = await chrome.storage.session.get(['snapshot', 'received']);
    if (!snapshot || Date.now() - received > 5000)
      throw new Error('请先在已准入的房间选择网站影片并连接扩展。');
    const origin = new URL(snapshot.url).origin + '/*';
    if (!(await chrome.permissions.request({ origins: [origin] })))
      throw new Error('未授权此站点，仍可手动对齐。');
    const result = await chrome.runtime.sendMessage({ type: 'open' });
    if (result?.error) throw new Error(result.error);
    show('请在官方网页完成登录和广告后开启同步。');
  } catch (e) {
    show(e);
  }
};
document.querySelector('#stop').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'disconnect' });
  show('同步已断开。');
};
