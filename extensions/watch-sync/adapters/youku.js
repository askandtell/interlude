// Standard video adapter. Ads and membership access require explicit user confirmation.
globalThis.__interludeSiteAdapter = {
  host: 'v.youku.com',
  videos: () => {
    const preferred = [...document.querySelectorAll('#player video, .ykplayer video')];
    return preferred.length ? preferred : [...document.querySelectorAll('video')];
  },
};
