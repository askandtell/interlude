import { test, expect, type Browser, type Page } from '@playwright/test';
import { createHost } from './helpers';

async function request(
  browser: Browser,
  host: Page,
  data: Awaited<ReturnType<typeof createHost>>,
  nickname: string,
) {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(new URL(`/room/${data.room.id}#invite=${data.invite}`, host.url()).href);
  await guest.getByLabel('你的昵称').fill(nickname);
  await guest.getByRole('button', { name: '敲门，申请加入' }).click();
  await expect(guest.getByRole('heading', { name: '等待房主批准' })).toBeVisible();
  return { guest, context };
}

test('new requests are visible from chat and a collapsed sidebar; review opens and clears approval', async ({
  page,
  browser,
}) => {
  const data = await createHost(page, 'direct');
  await page.getByRole('button', { name: '关闭聊天与成员', exact: true }).click();
  const { guest, context } = await request(browser, page, data, '小雨');
  try {
    await expect(page.getByRole('status').filter({ hasText: '小雨申请加入房间' })).toBeVisible();
    await expect(page.getByRole('button', { name: '查看申请', exact: true })).toBeVisible();
    await page.screenshot({ path: 'artifacts/admission-notice.png', fullPage: true });
    await expect(guest.getByRole('button', { name: '查看申请', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '查看申请', exact: true }).click();
    await expect(page.getByRole('heading', { name: '等待批准', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '批准 小雨', exact: true }).click();
    await expect(
      guest.getByRole('button', { name: '开始观看', exact: true }).first(),
    ).toBeEnabled();
    await expect(page.locator('.admission-notice')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('mobile requests reopen the members drawer and denied requests disappear', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await createHost(page, 'direct');
  const { guest, context } = await request(browser, page, data, '小雨');
  try {
    await expect(page.locator('.admission-notice')).toContainText('小雨申请加入房间');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '查看申请', exact: true }).click();
    await expect(page.getByRole('button', { name: '批准 小雨', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '拒绝 小雨', exact: true }).click();
    await expect(guest.getByRole('heading', { name: '申请未通过' })).toBeVisible();
    await expect(page.locator('.admission-notice')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('chat shows multiple requests and the queue survives a host refresh', async ({
  page,
  browser,
}) => {
  const data = await createHost(page, 'direct');
  const first = await request(browser, page, data, '小雨'),
    second = await request(browser, page, data, '小林');
  try {
    await expect(page.locator('.admission-notice')).toContainText('等 2 人申请加入');
    await page.reload();
    await expect(page.locator('.admission-notice')).toContainText('等 2 人申请加入');
    await page.getByRole('button', { name: '查看申请', exact: true }).click();
    await page.getByRole('button', { name: '批准 小雨', exact: true }).click();
    await page.getByRole('button', { name: '拒绝 小林', exact: true }).click();
    await expect(
      first.guest.getByRole('button', { name: '开始观看', exact: true }).first(),
    ).toBeEnabled();
    await expect(second.guest.getByRole('heading', { name: '申请未通过' })).toBeVisible();
    await expect(page.locator('.admission-notice')).toHaveCount(0);
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

test('fullscreen requests remain visible and review exits fullscreen without losing the request', async ({
  page,
  browser,
}) => {
  const data = await createHost(page, 'direct');
  const fullscreen = page.getByRole('button', { name: '全屏观看', exact: true });
  test.skip(!(await fullscreen.isVisible()), 'Browser does not offer fullscreen');
  await fullscreen.click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  const { guest, context } = await request(browser, page, data, '小雨');
  try {
    await expect(page.locator(':fullscreen .admission-notice')).toContainText('小雨申请加入房间');
    await page.getByRole('button', { name: '查看申请', exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.getByRole('button', { name: '批准 小雨', exact: true }).click();
    await expect(
      guest.getByRole('button', { name: '开始观看', exact: true }).first(),
    ).toBeEnabled();
  } finally {
    await context.close();
  }
});
