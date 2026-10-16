// Standard video adapter. Ads and membership access require explicit user confirmation.
globalThis.__interludeSiteAdapter = {
  host: 'www.bilibili.com',
  videos: () => {
    const preferred = [
      ...document.querySelectorAll('.bpx-player-container video, .bilibili-player-video video'),
    ];
    return preferred.length ? preferred : [...document.querySelectorAll('video')];
  },
};
