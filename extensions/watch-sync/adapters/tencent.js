// Standard video adapter. Ads and membership access require explicit user confirmation.
globalThis.__interludeSiteAdapter = {
  host: 'v.qq.com',
  videos: () => {
    const preferred = [...document.querySelectorAll('txpdiv video, .txp_player video')];
    return preferred.length ? preferred : [...document.querySelectorAll('video')];
  },
};
