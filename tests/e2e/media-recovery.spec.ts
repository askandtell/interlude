import { test, expect } from '@playwright/test';
import { createHost } from './helpers';

test('media outage recovers health automatically and retries the same prepared file', async ({
  page,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires local video fixtures and real LiveKit');
  let healthCalls = 0,
    tokenCalls = 0;
  await page.route('**/api/health', async (route) => {
    healthCalls++;
    if (healthCalls <= 2)
      await route.fulfill({ json: { status: 'control-only', storage: true, media: false } });
    else await route.continue();
  });
  await page.route('**/media-token', async (route) => {
    if (++tokenCalls === 1)
      await route.fulfill({
        status: 503,
        json: {
          code: 'MEDIA_UNAVAILABLE',
          error: '无法连接媒体服务，影片文件仍保留。请确认 LiveKit 正在运行后重试播放',
        },
      });
    else await route.continue();
  });
  await createHost(page);
  await page.locator('input[type=file]').first().setInputFiles('.cache/fixtures/sample.mp4');
  await expect(page.locator('.local-composite')).toBeVisible();
  const source = await page.locator('.movie-element').evaluate((v) => (v as HTMLVideoElement).src);
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await expect(
    page.getByText('无法连接媒体服务，影片文件仍保留。请确认 LiveKit 正在运行后重试播放'),
  ).toBeVisible();
  await expect.poll(() => healthCalls, { timeout: 15000 }).toBeGreaterThan(2);
  await expect(page.getByText('媒体服务暂不可用', { exact: true })).toHaveCount(0);
  expect(await page.locator('.movie-element').evaluate((v) => (v as HTMLVideoElement).src)).toBe(
    source,
  );
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '暂停放映', exact: true }).first()).toBeVisible();
  expect(tokenCalls).toBe(2);
  await expect(
    page.getByText('无法连接媒体服务，影片文件仍保留。请确认 LiveKit 正在运行后重试播放'),
  ).toHaveCount(0);
});
