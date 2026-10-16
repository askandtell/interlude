// The fallback survives a failed entry-module request; React replaces it on startup.
(() => {
  function showFailure() {
    const message = document.getElementById('startup-message');
    const retry = document.getElementById('startup-retry');
    if (!message || !retry) return;
    message.textContent = '页面加载未完成，请检查网络后重新加载。';
    retry.hidden = false;
  }
  document.getElementById('startup-retry')?.addEventListener('click', () => location.reload());
  window.addEventListener('error', (event) => {
    if (event.target instanceof HTMLScriptElement) showFailure();
  }, true);
  window.setTimeout(showFailure, 15000);
})();
