import { test, expect, type Page } from '@playwright/test';
import { createHost, admit } from './helpers';
import { existsSync, writeFileSync } from 'node:fs';

async function start(page: Page) {
  await page.locator('input[type=file]').first().setInputFiles('.cache/fixtures/barcode.mp4');
  await expect(page.locator('.ready-strip')).toBeVisible();
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await expect(page.locator('.player-state')).toContainText('正在放映');
}
const frames = (page: Page) =>
  page
    .locator('video.remote-movie')
    .evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames);

test('two viewers receive actual P2P film and separate voice without cloud tokens', async ({
  page,
  browser,
}) => {
  test.skip(
    !existsSync('.cache/fixtures/barcode.mp4'),
    'Generate fixtures with npm run test:media; P2P needs no relay service',
  );
  test.setTimeout(90000);
  let tokens = 0;
  const errors: string[] = [];
  await browser.contexts()[0].addInitScript(() => {
    const Native = RTCPeerConnection;
    (window as any).__peers = [];
    window.RTCPeerConnection = new Proxy(Native, {
      construct(target, args) {
        const pc = new target(...args);
        (window as any).__peers.push(pc);
        return pc;
      },
    });
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/media-token')) tokens++;
  });
  const data = await createHost(page, 'direct');
  const { guest, context } = await admit(browser, page, data);
  await guest.evaluate(() => {
    const Native = RTCPeerConnection;
    (window as any).__peers = [];
    window.RTCPeerConnection = new Proxy(Native, {
      construct(target, args) {
        const pc = new target(...args);
        (window as any).__peers.push(pc);
        return pc;
      },
    });
  });
  guest.on('pageerror', (e) => errors.push(e.message));
  guest.on('request', (r) => {
    if (r.url().includes('/media-token')) tokens++;
  });
  await start(page);
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  try {
    await expect.poll(() => frames(guest), { timeout: 18000 }).toBeGreaterThan(5);
  } catch (e) {
    for (const p of [page, guest])
      console.log(
        await p.evaluate(() =>
          (window as any).__peers?.map((pc: RTCPeerConnection) => ({
            state: pc.connectionState,
            signaling: pc.signalingState,
            tracks: pc.getTransceivers().map((t) => ({
              mid: t.mid,
              dir: t.currentDirection,
              send: t.sender.track?.kind,
              recv: t.receiver.track.kind,
              muted: t.receiver.track.muted,
            })),
          })),
        ),
      );
    throw e;
  }
  const first = await frames(guest);
  await expect.poll(() => frames(guest)).toBeGreaterThan(first + 10);
  expect(
    await guest
      .locator('video.remote-movie')
      .evaluate((v: HTMLVideoElement) =>
        (v.srcObject as MediaStream).getTracks().map((t) => t.kind),
      ),
  ).toEqual(expect.arrayContaining(['audio', 'video']));
  await expect(guest.locator('.connection-notice')).toContainText('优先直连');
  await guest.locator('video.remote-movie').evaluate(async (v: HTMLVideoElement) => {
    const context = new AudioContext(),
      analyser = context.createAnalyser();
    context
      .createMediaStreamSource(new MediaStream((v.srcObject as MediaStream).getAudioTracks()))
      .connect(analyser);
    await context.resume();
    await new Promise((r) => setTimeout(r, 400));
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
    await context.close();
    if (rms < 0.005) throw new Error('Film audio is silent');
  });
  const third = await admit(browser, page, data);
  third.guest.on('request', (r) => {
    if (r.url().includes('/media-token')) tokens++;
  });
  await third.guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect.poll(() => frames(third.guest)).toBeGreaterThan(5);
  const decoded = (p: Page, selector: string) =>
    p.locator(selector).evaluate((v: HTMLVideoElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(v, 0, 0, 320, 180);
      let frame = 0;
      for (let b = 0; b < 12; b++)
        if (ctx.getImageData(b * 20 + 10, 60, 1, 1).data[0] > 128) frame |= 1 << b;
      return frame;
    });
  const samples: number[] = [];
  for (let n = 0; n < 20; n++) {
    const values = await Promise.all([
      decoded(page, '.screen video:not(.remote-movie)'),
      decoded(guest, 'video.remote-movie'),
      decoded(third.guest, 'video.remote-movie'),
    ]);
    samples.push(((Math.max(...values) - Math.min(...values)) * 1000) / 30);
    await new Promise((r) => setTimeout(r, 75));
  }
  const p95 = [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
  writeFileSync(
    'artifacts/direct-render-skew.json',
    JSON.stringify(
      {
        method:
          'Rendered frame barcode, 30fps, host and two direct viewers; single machine Chromium',
        samplesMs: samples,
        p95Ms: p95,
        targetMs: 500,
      },
      null,
      2,
    ),
  );
  expect(p95).toBeLessThanOrEqual(500);
  await page.getByRole('button', { name: '开启麦克风', exact: true }).click();
  await expect.poll(() => guest.locator('audio[data-voice]').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: '关闭麦克风', exact: true }).click();
  await page.getByRole('button', { name: '暂停放映', exact: true }).click();
  await expect(guest.locator('.player-state')).toContainText('影片已暂停');
  expect(tokens).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/hybrid-direct.png', fullPage: true });
  await third.context.close();
  await context.close();
});

test('failed direct negotiation automatically migrates existing file to actual SFU', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires actual local LiveKit');
  test.setTimeout(90000);
  const data = await createHost(page, 'direct');
  const { guest, context } = await admit(browser, page, data);
  // Fail only our direct peer's first SDP offer. LiveKit remains a real connection.
  await page.evaluate(() => {
    const original = RTCPeerConnection.prototype.createOffer as (
      this: RTCPeerConnection,
      options?: RTCOfferOptions,
    ) => Promise<RTCSessionDescriptionInit>;
    let first = true;
    RTCPeerConnection.prototype.createOffer = function (
      this: RTCPeerConnection,
      options?: RTCOfferOptions,
    ) {
      if (first) {
        first = false;
        return Promise.reject(new Error('test: direct path unavailable'));
      }
      return original.call(this, options!);
    } as typeof RTCPeerConnection.prototype.createOffer;
  });
  await start(page);
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect(page.locator('.connection-notice')).toContainText('云端转发', { timeout: 25000 });
  await expect(page.locator('.player-state')).toContainText('正在放映', { timeout: 25000 });
  await expect.poll(() => frames(guest), { timeout: 30000 }).toBeGreaterThan(8);
  await expect(guest.locator('.error-banner')).toHaveCount(0);
  await expect(page.locator('.error-banner')).toHaveCount(0);
  await expect(page.locator('.ready-strip')).toBeVisible();
  await expect(page.getByRole('button', { name: '开启麦克风', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/hybrid-fallback.png', fullPage: true });
  await context.close();
});

test('paused route changes stay paused and can return from relay to direct', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires actual local LiveKit');
  test.setTimeout(90000);
  const data = await createHost(page, 'direct'),
    { guest, context } = await admit(browser, page, data);
  await start(page);
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect.poll(() => frames(guest)).toBeGreaterThan(4);
  await page.getByRole('button', { name: '暂停放映', exact: true }).click();
  const position = await page
    .locator('.screen video:not(.remote-movie)')
    .evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.getByRole('button', { name: '改用转发', exact: true }).click();
  await expect(page.locator('.connection-notice')).toContainText('云端转发');
  await expect(page.locator('.player-state')).toContainText('影片已暂停', { timeout: 20000 });
  await page.getByRole('button', { name: '重试直连', exact: true }).click();
  await expect(page.locator('.connection-notice')).toContainText('优先直连');
  await expect(page.locator('.player-state')).toContainText('影片已暂停');
  expect(
    await page
      .locator('.screen video:not(.remote-movie)')
      .evaluate((v: HTMLVideoElement) => v.currentTime),
  ).toBeCloseTo(position, 1);
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  const before = await frames(guest);
  await expect.poll(() => frames(guest)).toBeGreaterThan(before + 5);
  await expect(guest.locator('.error-banner')).toHaveCount(0);
  await context.close();
});

test('fourth online member migrates an ongoing direct film without reselecting it', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires actual local LiveKit');
  test.setTimeout(90000);
  const data = await createHost(page, 'direct'),
    first = await admit(browser, page, data);
  await start(page);
  await first.guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect.poll(() => frames(first.guest)).toBeGreaterThan(4);
  const second = await admit(browser, page, data);
  await expect(page.locator('.connection-notice')).toContainText('优先直连');
  const third = await admit(browser, page, data);
  await expect(page.locator('.connection-notice')).toContainText('多人放映');
  await expect(page.locator('.player-state')).toContainText('正在放映', { timeout: 25000 });
  await expect
    .poll(
      () =>
        first.guest.locator('video.remote-movie').evaluate((v: HTMLVideoElement) => v.currentTime),
      { timeout: 25000 },
    )
    .toBeGreaterThan(1);
  await third.guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect.poll(() => frames(third.guest)).toBeGreaterThan(4);
  await expect(page.locator('.ready-strip')).toBeVisible();
  for (const c of [first.context, second.context, third.context]) await c.close();
});
