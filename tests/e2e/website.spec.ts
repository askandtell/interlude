import { test, expect, type Page } from '@playwright/test';
import { createHost, admit } from './helpers';
import { readFileSync } from 'node:fs';

test('website mode shares only canonical watch URL and authoritative time with admitted friends', async ({
  page,
  browser,
}) => {
  const data = await createHost(page);
  const { guest, context } = await admit(browser, page, data);
  await page.getByRole('button', { name: '使用视频网站一起看' }).click();
  await page.getByLabel('官方视频完整链接').fill('https://v.qq.com.evil.test/x/page/id.html');
  await page.getByRole('button', { name: '使用这个视频' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: '腾讯视频', exact: true })).toHaveCount(0);
  await page
    .getByLabel('官方视频完整链接')
    .fill('https://www.bilibili.com/video/BV123abc/?p=2&token=SECRET#private');
  await page.getByRole('button', { name: '使用这个视频' }).click();
  await expect(page.getByRole('heading', { name: '哔哩哔哩', exact: true })).toBeVisible();
  await expect(guest.getByRole('link', { name: '打开官方播放页' })).toHaveAttribute(
    'href',
    'https://www.bilibili.com/video/BV123abc/?p=2',
  );
  await expect(guest.getByRole('button', { name: '一起播放' })).toHaveCount(0);
  await expect(page.getByText('请重新选择影片文件')).toHaveCount(0);
  await page.getByLabel('对齐到（秒）').fill('83.5');
  await page.getByRole('button', { name: '设置时间', exact: true }).click();
  await expect(guest.getByLabel('房间目标时间')).toHaveText('01:23');
  await page.getByRole('button', { name: '一起播放', exact: true }).click();
  await expect(guest.getByText('房间时间正在前进')).toBeVisible();
  await page.getByRole('button', { name: '一起暂停', exact: true }).click();
  // Only sanitized timing is exposed to an explicitly connected extension.
  const snapshot = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const handler = (e: MessageEvent) => {
          if (e.data?.channel === 'interlude-extension-snapshot') {
            window.removeEventListener('message', handler);
            resolve(e.data.snapshot);
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({ channel: 'interlude-extension-request' }, location.origin);
      }),
  );
  expect(Object.keys(snapshot).sort()).toEqual([
    'epoch',
    'paused',
    'position',
    'revision',
    'roomId',
    'url',
  ]);
  expect(JSON.stringify(snapshot)).not.toContain('SECRET');
  await page.screenshot({ path: 'artifacts/website-room-desktop.png', fullPage: true });
  await guest.setViewportSize({ width: 390, height: 844 });
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await guest.screenshot({ path: 'artifacts/website-room-mobile.png', fullPage: true });
  await context.close();
  if (process.env.MEDIA_E2E) await checkLocalReplacement(page);
});

async function checkLocalReplacement(page: Page) {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'broken.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not a movie'),
    });
  await expect(page.getByText('本地影片准备失败，仍保留网站影片')).toBeVisible();
  await expect(page.getByRole('link', { name: '打开官方播放页' })).toHaveAttribute(
    'href',
    'https://www.bilibili.com/video/BV123abc/?p=2',
  );
  await page.locator('input[type=file]').first().setInputFiles('.cache/fixtures/sample.mp4');
  await expect(page.locator('.local-composite')).toBeVisible();
  await expect(page.getByRole('link', { name: '打开官方播放页' })).toHaveCount(0);
  await page.getByRole('button', { name: '使用视频网站一起看' }).click();
  await page.getByLabel('官方视频完整链接').fill('https://v.qq.com/x/page/abc.html');
  await page.getByRole('button', { name: '使用这个视频' }).click();
  await expect(page.getByRole('heading', { name: '腾讯视频', exact: true })).toBeVisible();
  await expect(page.locator('.local-composite')).toHaveCount(0);
  await page.getByRole('button', { name: '更换网站影片' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('extension player applies real video play/pause/seek and pauses on stale room or changed source', async ({
  page,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires generated local media fixtures');
  // A controlled fixture on an intercepted origin, not a claim of real Bilibili validation.
  await page.route('https://www.bilibili.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><video style="width:640px;height:360px" controls></video></body></html>',
    }),
  );
  await page.goto('https://www.bilibili.com/video/BV123abc/');
  await page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const video = document.querySelector('video')!;
    video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    await new Promise<void>((resolve) =>
      video.addEventListener('loadeddata', () => resolve(), { once: true }),
    );
    const state = window as any;
    state.__snapshot = { url: location.href, epoch: 1, revision: 1, position: 2, paused: true };
    state.chrome = {
      runtime: {
        sendMessage: async () => ({ snapshot: state.__snapshot, age: 0 }),
        onMessage: { addListener: () => {} },
      },
    };
  }, readFileSync('.cache/fixtures/sample.mp4').toString('base64'));
  await page.addScriptTag({ path: 'extensions/watch-sync/player.js' });
  await page.getByRole('button', { name: '我已进入正片，开启同步' }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.8);
  await page.evaluate(() => {
    (window as any).__snapshot = { ...(window as any).__snapshot, paused: false };
  });
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).paused))
    .toBe(false);
  await page.evaluate(() => {
    (window as any).__snapshot = { ...(window as any).__snapshot, position: 4, paused: true };
  });
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).paused))
    .toBe(true);
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(3.8);
  await page.evaluate(() => {
    (window as any).__snapshot = null;
  });
  await expect(
    page.getByText('房间连接中断或同步已断开，影片已暂停。请回到幕间检查。'),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).__snapshot = {
      url: location.href,
      epoch: 1,
      revision: 1,
      position: 1,
      paused: false,
    };
  });
  await page.getByRole('button', { name: '我已进入正片，开启同步' }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).paused))
    .toBe(false);
  await page.evaluate(() => {
    (window as any).__snapshot.epoch = 2;
  });
  await expect(page.getByText('影片或媒体代次已变化，请重新打开房间当前视频。')).toBeVisible();
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true);
});
