import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { createHost, admit } from './helpers';

test('ending a room closes a guest device panel and releases the local microphone test', async ({
  page,
  browser,
}) => {
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  await guest.evaluate(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).__deviceTracks = [];
    navigator.mediaDevices.getUserMedia = async (options) => {
      const s = await get(options);
      (window as any).__deviceTracks.push(...s.getTracks());
      return s;
    };
  });
  await guest.getByRole('button', { name: '房间设置' }).click();
  await guest.getByRole('button', { name: '开始检测', exact: true }).click();
  await expect(guest.getByRole('button', { name: '停止检测' })).toBeVisible();
  await page.getByRole('button', { name: '房间设置' }).click();
  await page.getByRole('button', { name: '结束本次放映', exact: true }).click();
  await page.getByRole('button', { name: '结束放映', exact: true }).click();
  await expect(guest.getByRole('heading', { name: '本次放映已结束' })).toBeVisible();
  await expect(guest.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() =>
      guest.evaluate(() =>
        (window as any).__deviceTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await context.close();
});

test('blocked remote playback has an explicit recovery action that clears the blocked state', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires real local SFU');
  const data = await createHost(page),
    { guest, context } = await admit(browser, page, data);
  await guest.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    let allowed = false;
    document.addEventListener(
      'click',
      (e) => {
        if ((e.target as HTMLElement).closest('.autoplay-prompt')) allowed = true;
      },
      true,
    );
    HTMLMediaElement.prototype.play = function () {
      if (this.classList.contains('remote-movie') && this.srcObject && !allowed)
        return Promise.reject(new DOMException('simulated autoplay denial', 'NotAllowedError'));
      return original.call(this);
    };
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible();
  await page.getByRole('button', { name: '开始放映', exact: true }).click();
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  const recover = guest.getByRole('button', { name: '点击恢复声音与画面' });
  await expect(recover).toBeVisible();
  await recover.click();
  await expect(recover).toHaveCount(0);
  await expect(guest.locator('.player-state')).toContainText('正在观看');
  await context.close();
});

test('functional lobby, invitation validation, recent records and no decorative modules', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今晚，和谁一起看？' })).toBeVisible();
  await page
    .getByLabel('房间邀请链接')
    .fill('https://example.com/room/aaaaaaaaaaaaaaaaaaaaaa#invite=bad');
  await page.getByRole('button', { name: '加入', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('这个站点');
  await createHost(page);
  await page.getByRole('button', { name: '离开放映室' }).click();
  await expect(page.locator('.recent-list')).toContainText('周末小影院');
  await page.getByRole('button', { name: '清空记录' }).click();
  await expect(page.getByText('还没有放映记录')).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    mkdirSync('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/v2-home-${width}.png`, fullPage: true });
  }
  expect(requests.some((url) => /CinemaScene|\/art\/|three\.js|gsap/.test(url))).toBe(false);
});

test('failed replacement preserves the previous prepared local file', async ({ page }) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires generated browser media fixtures');
  await createHost(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toContainText('barcode.mp4');
  const old = await page.locator('.movie-element').getAttribute('src');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'broken.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from([1, 2, 3, 4]),
    });
  await expect(page.locator('.preflight-error')).toBeVisible();
  await expect(page.locator('.ready-strip')).toContainText('barcode.mp4');
  expect(await page.locator('.movie-element').getAttribute('src')).toBe(old);
  await page.getByRole('button', { name: '返回原影片' }).click();
  await expect(page.locator('.preflight-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始放映', exact: true })).toBeEnabled();
});

test('cancelling a pending preflight never commits the late result', async ({ page }) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires generated media fixtures');
  await createHost(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/*mediabunny*.js*', async (route) => {
    await gate;
    await route.continue();
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.getByRole('button', { name: '取消检测' })).toBeVisible();
  await page.getByRole('button', { name: '取消检测' }).click();
  release();
  await expect(page.getByRole('button', { name: '选择本地影片', exact: true })).toBeEnabled();
  await page.waitForTimeout(600);
  await expect(page.locator('.ready-strip')).toHaveCount(0);
  await expect(page.locator('.movie-element')).toHaveCount(0);
});

test('host refresh requires explicit matching-file resume and stays paused', async ({ page }) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires generated fixtures');
  await createHost(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible();
  const slider = page.getByRole('slider', { name: '影片进度' });
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.locator('.movie-element').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(10);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('button', { name: '选择本地影片', exact: true })).toBeEnabled();
  await expect(page.getByText('请重新选择影片文件', { exact: true })).toBeVisible();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.resume-prompt')).toBeVisible();
  await page.locator('.resume-prompt').getByRole('button', { name: /继续/ }).click();
  await expect(page.locator('.resume-prompt')).toHaveCount(0);
  expect(
    await page
      .locator('.movie-element')
      .evaluate((v: HTMLVideoElement) => v.paused && v.currentTime > 10),
  ).toBe(true);
});

async function subtitleWhitePixels(page: Page) {
  return page.locator('.local-composite').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas
      .getContext('2d')!
      .getImageData(
        0,
        Math.floor(canvas.height * 0.65),
        canvas.width,
        Math.max(1, Math.floor(canvas.height * 0.34)),
      ).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] > 210 && data[i + 1] > 210 && data[i + 2] > 210) n++;
    return n;
  });
}
test('subtitle controls update the shared compositor, support wrapping and clear safely', async ({
  page,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires generated fixtures');
  await createHost(page);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/barcode.mp4'));
  await expect(page.locator('.ready-strip')).toBeVisible();
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'friend.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1\n00:00:00,000 --> 00:00:30,000\nHELLO FRIEND\n'),
    });
  const first = await subtitleWhitePixels(page);
  expect(first).toBeGreaterThan(10);
  await page.getByRole('button', { name: '字幕设置' }).click();
  await expect(page.getByText('friend.srt', { exact: true })).toBeVisible();
  await page.getByText('120%', { exact: true }).click();
  await expect.poll(() => subtitleWhitePixels(page)).toBeGreaterThan(first);
  await page.getByLabel('字幕时间偏移').fill('10');
  await expect.poll(() => subtitleWhitePixels(page)).toBe(0);
  await page.getByLabel('字幕时间偏移').fill('0');
  await expect.poll(() => subtitleWhitePixels(page)).toBeGreaterThan(10);
  await page.screenshot({ path: 'artifacts/v2-subtitles.png', fullPage: true });
  await page.getByRole('button', { name: '清除字幕' }).click();
  await expect.poll(() => subtitleWhitePixels(page)).toBe(0);
});

test('device test requires a click, never joins SFU, and closes all test tracks', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).__testTracks = [];
    navigator.mediaDevices.getUserMedia = async (c) => {
      const stream = await get(c);
      (window as any).__testTracks.push(...stream.getTracks());
      return stream;
    };
  });
  let credentials = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/media-token')) credentials++;
  });
  await createHost(page);
  expect(await page.evaluate(() => (window as any).__testTracks.length)).toBe(0);
  await page.getByRole('button', { name: '房间设置' }).click();
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止检测' })).toBeVisible();
  await expect
    .poll(() => page.getByRole('meter', { name: '麦克风输入电平' }).getAttribute('aria-valuenow'))
    .not.toBe('0');
  expect(credentials).toBe(0);
  await page.getByRole('button', { name: '播放测试音' }).click();
  await page.screenshot({ path: 'artifacts/v2-devices.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__testTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  expect(credentials).toBe(0);
});

test('microphone denial leaves the test off with an actionable message', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
  });
  await createHost(page);
  await page.getByRole('button', { name: '房间设置' }).click();
  await page.getByRole('button', { name: '开始检测', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('麦克风权限未允许');
  await expect(page.getByRole('button', { name: '开始检测', exact: true })).toBeEnabled();
});

test('responsive room, drawer focus, keyboard isolation and fullscreen controls', async ({
  page,
}) => {
  await createHost(page);
  for (const size of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/v2-room-${size.width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '显示或隐藏聊天' }).click();
  await expect(page.getByRole('dialog', { name: '聊天与成员' })).toBeVisible();
  await page.getByLabel('聊天消息').fill('空 格 不 应 触 发 播 放');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('聊天消息')).toHaveValue('空 格 不 应 触 发 播 放 ');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fullscreen = page.getByRole('button', { name: '全屏观看' });
  if (await fullscreen.count()) {
    await fullscreen.click();
    await expect
      .poll(() =>
        page.evaluate(() => document.fullscreenElement?.classList.contains('player-shell')),
      )
      .toBe(true);
    await expect(page.locator('.player-shell .transport-bar')).toBeVisible();
    await page.getByRole('button', { name: '退出全屏' }).click();
  }
});
