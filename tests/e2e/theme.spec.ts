import { test, expect } from '@playwright/test';

test('failed entry loading shows a retry action and recovers after reload', async ({ page }) => {
  await page.route('**/src/main.tsx*', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('页面加载未完成');
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible();
  await page.unroute('**/src/main.tsx*');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('button', { name: '创建放映室', exact: true })).toBeEnabled();
});

test('create dialog keeps transitions and theme stable across input and another room tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: '创建放映室', exact: true });
  await expect(open).toBeEnabled();
  await page.evaluate(() => {
    const state = window as any;
    state.__themeChanges = [];
    new MutationObserver((records) => {
      for (const r of records) {
        if (
          r.type === 'attributes' ||
          [...r.addedNodes].some(
            (n) => n instanceof Element && n.hasAttribute('data-mantine-disable-transition'),
          )
        )
          state.__themeChanges.push(r.type);
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-mantine-color-scheme'],
    });
  });
  await open.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('你的昵称').pressSequentially('小满');
  const other = await context.newPage();
  await other.goto('/room/abcdefghijklmnop');
  await expect(other.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');
  await page.getByLabel('房间名字').fill('周末影院');
  await expect.poll(() => page.evaluate(() => (window as any).__themeChanges.length)).toBe(0);
  const dialog = page.getByRole('dialog');
  const styles = await dialog.evaluate((el) => ({
    opacity: getComputedStyle(el).opacity,
    transform: getComputedStyle(el).transform,
  }));
  expect(styles.opacity).toBe('1');
  await page.screenshot({ path: 'artifacts/create-dialog-stable.png', fullPage: true });
  await other.close();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await open.click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as any).__themeChanges.length)).toBe(0);
  // A route change within the same tab still switches the theme in both directions.
  await page.evaluate(() => {
    history.pushState({}, '', '/room/abcdefghijklmnop');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await page.evaluate(() => {
    history.pushState({}, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');
});
