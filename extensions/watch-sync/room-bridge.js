(() => {
  if (globalThis.__interludeBridge) {
    globalThis.__interludeBridge();
  }
  let timer;
  const message = (e) => {
    if (
      e.source !== window ||
      e.origin !== location.origin ||
      e.data?.channel !== 'interlude-extension-snapshot'
    )
      return;
    chrome.runtime.sendMessage({ type: 'snapshot', snapshot: e.data.snapshot }).catch(stop);
  };
  const tick = () => {
    window.postMessage({ channel: 'interlude-extension-request' }, location.origin);
    chrome.runtime
      .sendMessage({ type: 'status' })
      .then((r) => {
        if (r?.text)
          window.postMessage(
            {
              channel: 'interlude-extension-status',
              text: r.text,
              playerConnected: r.playerConnected === true,
              confirmed: r.confirmed === true,
            },
            location.origin,
          );
      })
      .catch(stop);
  };
  function stop() {
    clearInterval(timer);
    window.removeEventListener('message', message);
  }
  window.addEventListener('message', message);
  timer = setInterval(tick, 1000);
  globalThis.__interludeBridge = stop;
  tick();
})();
