import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHost, admit } from './helpers';
test('home, private admission, real chat, removal and mobile layouts', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('今晚');
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  await guest.getByLabel('聊天消息').fill('好啦，一起看！');
  await guest.getByRole('button', { name: '发送消息' }).click();
  await page.getByRole('button', { name: '聊天', exact: true }).click();
  await expect(page.getByText('好啦，一起看！')).toBeVisible();
  await page.screenshot({ path: 'artifacts/room-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/room-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /座位/ }).click();
  await page.getByRole('button', { name: '移除 阿远' }).click();
  await expect(guest.getByRole('alert')).toContainText('已离开');
  expect(errors).toEqual([]);
  await context.close();
});
test('expired or malformed invite is actionable and never enters a room', async ({ page }) => {
  await page.goto('/room/aaaaaaaaaaaaaaaaaaaaaa#invite=bad');
  await page.getByLabel('你的昵称').fill('访客');
  await page.getByRole('button', { name: '敲门，申请加入' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('聊天消息')).toHaveCount(0);
});

test('actual SFU film video/audio, host controls and microphone track', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires a running local LiveKit and generated fixtures');
  test.setTimeout(120000);
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  const faults: string[] = [];
  page.on('pageerror', (e) => faults.push(e.message));
  guest.on('pageerror', (e) => faults.push(e.message));
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await expect(page.locator('.player-state')).toContainText('正在放映', { timeout: 30000 });
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect
    .poll(async () =>
      guest.locator('video.remote-movie').evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThanOrEqual(320);
  await expect
    .poll(async () =>
      guest
        .locator('video.remote-movie')
        .evaluate((v: HTMLVideoElement) =>
          v.srcObject instanceof MediaStream ? v.srcObject.getTracks().map((t) => t.kind) : [],
        ),
    )
    .toEqual(expect.arrayContaining(['video', 'audio']));
  const first = await guest
    .locator('video.remote-movie')
    .evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames);
  await expect
    .poll(() =>
      guest
        .locator('video.remote-movie')
        .evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames),
    )
    .toBeGreaterThan(first + 5);
  await guest.locator('video.remote-movie').evaluate(async (v: HTMLVideoElement) => {
    const audio = new AudioContext(),
      stream = v.srcObject as MediaStream,
      source = audio.createMediaStreamSource(new MediaStream(stream.getAudioTracks())),
      analyser = audio.createAnalyser();
    source.connect(analyser);
    await audio.resume();
    const samples = new Float32Array(analyser.fftSize);
    await new Promise((r) => setTimeout(r, 400));
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
    await audio.close();
    if (rms < 0.005) throw new Error(`Expected audible film tone, RMS=${rms}`);
  });
  async function renderedFrame(p: Page, selector: string) {
    return p.locator(selector).evaluate((v: HTMLVideoElement) => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, 320, 180);
      let n = 0;
      for (let b = 0; b < 12; b++) {
        const pixel = ctx.getImageData(b * 20 + 10, 60, 1, 1).data;
        if (pixel[0] > 128) n |= 1 << b;
      }
      return n;
    });
  }
  const samples: number[] = [];
  for (let n = 0; n < 24; n++) {
    const [h, g] = await Promise.all([
      renderedFrame(page, '.screen video:not(.remote-movie)'),
      renderedFrame(guest, 'video.remote-movie'),
    ]);
    samples.push((Math.abs(h - g) * 1000) / 30);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const p95 = [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
  writeFileSync(
    'artifacts/render-skew.json',
    JSON.stringify(
      {
        method:
          'Decoded 12-bit frame barcode, concurrent browser canvas reads, 30fps. Local host versus one SFU viewer.',
        samplesMs: samples,
        p95Ms: p95,
        targetMs: 500,
      },
      null,
      2,
    ),
  );
  expect(p95).toBeLessThanOrEqual(500);
  await page.getByRole('button', { name: '暂停放映', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始放映', exact: true }).first()).toBeVisible();
  const pausedFrame = await renderedFrame(page, '.screen video:not(.remote-movie)');
  // SFU encoders may retain a nearby frame when the picture stops changing.
  // Check the agreed 500ms bound and actual frozen pixels, not identical frame IDs.
  await expect
    .poll(
      async () =>
        (Math.abs((await renderedFrame(guest, 'video.remote-movie')) - pausedFrame) * 1000) / 30,
      { timeout: 3000 },
    )
    .toBeLessThanOrEqual(500);
  const guestPausedFrame = await renderedFrame(guest, 'video.remote-movie');
  await guest.waitForTimeout(750);
  expect(
    Math.abs((await renderedFrame(guest, 'video.remote-movie')) - guestPausedFrame),
  ).toBeLessThanOrEqual(1);
  await page.locator('.timeline [role=slider]').focus();
  await page.keyboard.press('Home');
  for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await expect
    .poll(
      async () => {
        const [h, g] = await Promise.all([
          renderedFrame(page, '.screen video:not(.remote-movie)'),
          renderedFrame(guest, 'video.remote-movie'),
        ]);
        return (Math.abs(h - g) * 1000) / 30;
      },
      { timeout: 3000 },
    )
    .toBeLessThanOrEqual(500);
  await page.getByRole('button', { name: '开启麦克风' }).click();
  await expect.poll(() => guest.locator('audio[data-voice=true]').count()).toBeGreaterThan(0);
  await guest.screenshot({ path: 'artifacts/real-media-guest.png', fullPage: true });
  await page.getByRole('button', { name: '关闭麦克风' }).click();
  expect(faults).toEqual([]);
  await context.close();
});
for (const sample of [
  { file: 'sample.webm', convert: false },
  { file: 'silent.mp4', convert: false },
  { file: 'sample.mkv', convert: true },
]) {
  test(`actual browser media compatibility: ${sample.file}`, async ({ page, browser }) => {
    test.skip(!process.env.MEDIA_E2E, 'Requires local LiveKit and fixtures');
    test.setTimeout(90000);
    const data = await createHost(page),
      { guest, context } = await admit(browser, page, data);
    if (sample.convert) {
      await page.getByRole('button', { name: '房间设置' }).click();
      await page.getByText('兼容转换（下次选片生效）', { exact: true }).click();
      await expect(page.getByRole('switch', { name: '兼容转换（下次选片生效）' })).toBeChecked();
      await page.keyboard.press('Escape');
    }
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles(path.resolve('.cache/fixtures/' + sample.file));
    await expect(page.locator('.ready-strip')).toBeVisible({ timeout: 35000 });
    await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
    await expect(page.locator('.player-state')).toContainText('正在放映', { timeout: 20000 });
    await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
    await expect
      .poll(() =>
        guest.locator('video.remote-movie').evaluate((v: HTMLVideoElement) => v.videoWidth),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        guest
          .locator('video.remote-movie')
          .evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames),
      )
      .toBeGreaterThan(2);
    await context.close();
  });
}
test('damaged files produce a recoverable error without publishing', async ({ page }) => {
  await createHost(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'broken.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not-a-video'),
    });
  await expect(page.getByRole('alert')).toContainText('请确认文件未损坏');
  await expect(page.getByRole('alert')).not.toContainText('Input has');
  await expect(page.getByRole('button', { name: '选择本地影片' })).toBeEnabled();
});
test('eight real participants receive the shared film', async ({ page, browser }) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires local SFU');
  test.setTimeout(120000);
  const data = await createHost(page),
    contexts = [];
  await page.getByRole('button', { name: /座位/ }).click();
  const viewers: Page[] = [];
  for (let n = 1; n <= 7; n++) {
    const context = await browser.newContext(),
      guest = await context.newPage();
    contexts.push(context);
    viewers.push(guest);
    await guest.goto(`http://127.0.0.1:15173/room/${data.room.id}#invite=${data.invite}`);
    await guest.getByLabel('你的昵称').fill(`朋友${n}`);
    await guest.getByRole('button', { name: '敲门，申请加入' }).click();
    await page.getByRole('button', { name: `批准 朋友${n}` }).click();
    await expect(
      guest.getByRole('button', { name: '开始观看', exact: true }).first(),
    ).toBeVisible();
  }
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  for (const guest of viewers) {
    await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
    await expect
      .poll(() =>
        guest
          .locator('video.remote-movie')
          .evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames),
      )
      .toBeGreaterThan(3);
  }
  await page.screenshot({ path: 'artifacts/eight-person-room.png', fullPage: true });
  writeFileSync(
    'artifacts/eight-person.json',
    JSON.stringify(
      {
        participants: 8,
        viewers: 7,
        receivedDecodedFrames: true,
        network: 'single Windows host, local native LiveKit, Chromium',
      },
      null,
      2,
    ),
  );
  for (const context of contexts) await context.close();
});
test('continuous real-media soak', async ({ page, browser }) => {
  test.skip(!process.env.SOAK_SECONDS, 'Opt-in soak; set SOAK_SECONDS=7200 for release validation');
  const duration = Number(process.env.SOAK_SECONDS);
  test.setTimeout((duration + 90) * 1000);
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible({ timeout: 30000 });
  await page.locator('.screen video:not(.remote-movie)').evaluate((v: HTMLVideoElement) => {
    v.loop = true;
  });
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  let previous = 0;
  const samples: unknown[] = [];
  const start = Date.now();
  while (Date.now() - start < duration * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const current = await guest.locator('video.remote-movie').evaluate((v: HTMLVideoElement) => ({
      frames: v.getVideoPlaybackQuality().totalVideoFrames,
      tracks: (v.srcObject as MediaStream)?.getTracks().length,
      heap: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize,
    }));
    expect(current.frames).toBeGreaterThan(previous);
    expect(current.tracks).toBe(2);
    previous = current.frames;
    samples.push({ elapsedMs: Date.now() - start, ...current });
  }
  writeFileSync(
    'artifacts/soak.json',
    JSON.stringify(
      { requestedSeconds: duration, elapsedSeconds: (Date.now() - start) / 1000, samples },
      null,
      2,
    ),
  );
  await context.close();
});

test('guest control reconnect restores membership and host refresh requires selecting the file again', async ({
  page,
  browser,
}) => {
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  await context.setOffline(true);
  await guest.waitForTimeout(700);
  await context.setOffline(false);
  await expect
    .poll(() =>
      guest.evaluate(async () => {
        const r = await fetch(location.pathname.replace('/room/', '/api/rooms/'));
        return r.status;
      }),
    )
    .toBe(200);
  await guest.getByLabel('聊天消息').fill('重连后还在这里');
  await expect(async () => {
    await guest.getByRole('button', { name: '发送消息' }).click();
    await expect(guest.getByText('重连后还在这里')).toBeVisible();
  }).toPass({ timeout: 15000 });
  await page.reload();
  await expect(page.getByRole('button', { name: '选择本地影片' })).toBeVisible();
  await expect(page.locator('.ready-strip')).toHaveCount(0);
  await context.close();
});

test('local subtitles are burned into actual shared film frames', async ({ page, browser }) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires real SFU and fixtures');
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible({ timeout: 30000 });
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'friend.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1\n00:00:00,000 --> 00:00:30,000\nHELLO FRIEND\n'),
    });
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  await expect(page.locator('.screen .local-composite')).toBeAttached();
  await expect
    .poll(() =>
      guest.locator('video.remote-movie').evaluate((v: HTMLVideoElement) => {
        if (!v.videoWidth) return 0;
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(v, 0, 0);
        const pixels = ctx.getImageData(
          0,
          Math.floor(c.height * 0.8),
          c.width,
          Math.max(1, Math.floor(c.height * 0.19)),
        ).data;
        let white = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] > 210 && pixels[i + 1] > 210 && pixels[i + 2] > 210) white++;
        return white;
      }),
    )
    .toBeGreaterThan(10);
  await guest.screenshot({ path: 'artifacts/subtitles-real-media.png' });
  await context.close();
});
