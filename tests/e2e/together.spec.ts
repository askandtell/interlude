import { test, expect, type Page } from '@playwright/test';
import { createHost, admit } from './helpers';
import { mkdirSync, writeFileSync } from 'node:fs';
async function select(page: Page, file = '.cache/fixtures/barcode.mp4') {
  await page.locator('input[type=file]').first().setInputFiles(file);
  await expect(page.locator('.preflight-error')).toHaveCount(0);
  await expect(page.locator('.screen canvas')).toBeVisible();
}
async function join(page: Page) {
  await page.getByLabel('这是同一部、同一剪辑版本的影片').check();
  await page.getByRole('button', { name: '加入一起看', exact: true }).click();
}
const position = (p: Page) =>
  p.locator('video.movie-element').evaluate((v: HTMLVideoElement) => v.currentTime);
test('independent files play in sync without media connections, with pause, seek and removal', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  let mediaCalls = 0;
  const requests: string[] = [];
  await page.context().addInitScript(() => {
    (window as any).__mediaCalls = 0;
    const old = window.RTCPeerConnection;
    if (old)
      window.RTCPeerConnection = new Proxy(old, {
        construct() {
          (window as any).__mediaCalls++;
          throw Error('Streaming is removed');
        },
      });
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__mediaCalls++;
      throw Error('Microphone is removed');
    };
  });
  page.on('request', (r) => {
    if (/media-token|livekit|peer-signal/.test(r.url())) requests.push(r.url());
  });
  const data = await createHost(page, 'direct');
  const { guest, context } = await admit(browser, page, data);
  try {
    await select(page);
    await select(guest);
    await join(guest);
    await page.getByRole('button', { name: '开始放映', exact: true }).click();
    await expect.poll(() => position(guest)).toBeGreaterThan(1);
    const decoded = (p: Page) =>
      p.locator('video.movie-element').evaluate((v: HTMLVideoElement) => {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        const x = c.getContext('2d')!;
        x.drawImage(v, 0, 0, 320, 180);
        let f = 0;
        for (let b = 0; b < 12; b++)
          if (x.getImageData(b * 20 + 10, 60, 1, 1).data[0] > 128) f |= 1 << b;
        return f;
      });
    const samples: number[] = [];
    for (let n = 0; n < 20; n++) {
      const [a, b] = await Promise.all([decoded(page), decoded(guest)]);
      samples.push((Math.abs(a - b) * 1000) / 30);
      await page.waitForTimeout(75);
    }
    const p95 = [...samples].sort((a, b) => a - b)[18];
    expect(p95).toBeLessThanOrEqual(500);
    await page.getByRole('button', { name: '暂停放映', exact: true }).click();
    await expect(guest.locator('.player-state')).toContainText('影片已暂停');
    await page.getByRole('slider', { name: '影片进度', exact: true }).focus();
    await page.keyboard.press('End');
    await expect.poll(() => position(guest)).toBeGreaterThan(10);
    expect(await page.evaluate(() => (window as any).__mediaCalls)).toBe(0);
    expect(requests).toEqual([]);
    expect(await guest.getByRole('button', { name: /麦克风/ }).count()).toBe(0);
    mkdirSync('artifacts', { recursive: true });
    writeFileSync(
      'artifacts/together-sync.json',
      JSON.stringify(
        {
          samplesMs: samples,
          p95Ms: p95,
          mediaConnections: 0,
          network: new URL(page.url()).origin,
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: 'artifacts/together-room.png', fullPage: true });
    await page.getByRole('button', { name: /座位/ }).click();
    await page.getByRole('button', { name: '移除 阿远', exact: true }).click();
    await expect(guest.getByRole('alert')).toContainText('已离开');
    await expect(guest.locator('video.movie-element')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test('eight members each open a local file; readiness and decoding are independent', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const data = await createHost(page, 'direct');
  await select(page);
  const members = [];
  try {
    for (let n = 0; n < 7; n++) {
      const member = await admit(browser, page, data);
      members.push(member);
      await select(member.guest);
      await join(member.guest);
    }
    await page.getByRole('button', { name: '开始放映', exact: true }).click();
    for (const { guest } of members)
      await expect.poll(() => position(guest), { timeout: 15000 }).toBeGreaterThan(0.5);
    await expect(page.locator('.member-count')).toContainText('8 / 8');
    await page.getByRole('button', { name: '暂停放映', exact: true }).click();
    for (const { guest } of members)
      await expect(guest.locator('.player-state')).toContainText('影片已暂停');
  } finally {
    for (const m of members) await m.context.close();
  }
});
test('failed replacement keeps old source; mismatched files cannot join; refresh requires reselection', async ({
  page,
  browser,
}) => {
  const data = await createHost(page, 'direct');
  await select(page);
  const { guest, context } = await admit(browser, page, data);
  try {
    await guest.locator('input[type=file]').first().setInputFiles('.cache/fixtures/silent.mp4');
    await expect(guest.getByRole('alert')).toContainText('时长');
    await expect(guest.locator('video.movie-element')).toHaveCount(0);
    const old = await page.locator('video.movie-element').evaluate((v: HTMLVideoElement) => v.src);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('broken') });
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.locator('video.movie-element').evaluate((v: HTMLVideoElement) => v.src)).toBe(
      old,
    );
    await page.reload();
    await expect(page.getByText('请重新选择影片文件')).toBeVisible();
    await expect(page.locator('video.movie-element')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test('member subtitles stay local and mobile layout stays usable', async ({ page, browser }) => {
  const data = await createHost(page, 'direct');
  await select(page);
  const { guest, context } = await admit(browser, page, data);
  try {
    await select(guest);
    await guest.getByRole('button', { name: '字幕设置', exact: true }).click();
    await guest
      .locator('input[type=file]')
      .nth(1)
      .setInputFiles({
        name: 'private.srt',
        mimeType: 'text/plain',
        buffer: Buffer.from('1\n00:00:00,000 --> 00:00:20,000\n私人字幕'),
      });
    await expect(guest.getByText('private.srt')).toBeVisible();
    await expect(page.getByText('private.srt')).toHaveCount(0);
    await guest.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await guest.screenshot({ path: 'artifacts/together-mobile.png', fullPage: true });
  } finally {
    await context.close();
  }
});

test('control reconnect retains the file and requires an explicit restart', async ({ page }) => {
  let closeConnection = () => {};
  await page.routeWebSocket('**/socket.io/**', (route) => {
    route.connectToServer();
    closeConnection = () => route.close();
  });
  await createHost(page);
  await select(page);
  await page.getByRole('button', { name: '开始放映', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(0.5);
  const source = await page.locator('video.movie-element').evaluate((v: HTMLVideoElement) => v.src);
  closeConnection();
  await expect(page.locator('.player-state')).toContainText('已准备');
  await expect(page.getByRole('button', { name: '开始放映', exact: true })).toBeEnabled();
  expect(await page.locator('video.movie-element').evaluate((v: HTMLVideoElement) => v.src)).toBe(
    source,
  );
  expect(
    await page.locator('video.movie-element').evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(true);
  const before = await position(page);
  await page.waitForTimeout(400);
  expect(await position(page)).toBeCloseTo(before, 1);
  await page.getByRole('button', { name: '开始放映', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(before + 0.5);
});
