import { expect, type Page, type Browser } from '@playwright/test';
export async function createHost(page: Page, delivery: 'direct' | 'relay' = 'relay') {
  await page.goto('/');
  await page.getByRole('button', { name: '创建放映室', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('你的昵称').fill('小满');
  await modal.getByLabel('房间名字').fill('周末小影院');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: '创建放映室', exact: true }).click();
  const response = await created;
  expect(
    response.status(),
    'Repeated suites need a fresh local control process when the hourly creation quota is exhausted',
  ).toBe(201);
  const data = await response.json();
  await expect(page.getByRole('button', { name: '选择本地影片', exact: true })).toBeEnabled();
  return data as { room: { id: string }; invite: string };
}
export async function admit(
  browser: Browser,
  host: Page,
  data: { room: { id: string }; invite: string },
) {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    guest = await context.newPage();
  await guest.goto(new URL(`/room/${data.room.id}#invite=${data.invite}`, host.url()).href);
  await guest.getByLabel('你的昵称').fill('阿远');
  await guest.getByRole('button', { name: '敲门，申请加入' }).click();
  await expect(guest.getByRole('heading', { name: '等待房主批准' })).toBeVisible();
  await host.getByRole('button', { name: /座位/ }).click();
  await host.getByRole('button', { name: '批准 阿远' }).click();
  await expect(
    guest.getByRole('button', { name: '选择自己的影片', exact: true }).first(),
  ).toBeVisible();
  return { guest, context };
}
