// Standard video adapter. Ads and membership access require explicit user confirmation.
globalThis.__interludeSiteAdapter = {
  host: 'www.iqiyi.com',
  videos: () => {
    const preferred = [...document.querySelectorAll('#flashbox video, .iqp-player video')];
    return preferred.length ? preferred : [...document.querySelectorAll('video')];
  },
};
