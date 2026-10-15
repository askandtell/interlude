import { test, expect } from '@playwright/test';
import { createHost, admit } from './helpers';

test('native setConfiguration rejection uses dual-peer initialization and delivers decoded movie audio/video', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.MEDIA_E2E, 'Requires real LiveKit and generated media fixtures');
  test.setTimeout(90000);
  const block = () => {
    (window as any).__configurationCalls = 0;
    RTCPeerConnection.prototype.setConfiguration = () => {
      (window as any).__configurationCalls++;
      throw new DOMException(
        'Attempted to modify the PeerConnection configuration in an unsupported way',
        'InvalidModificationError',
      );
    };
  };
  await page.addInitScript(block);
  const data = await createHost(page);
  const { guest, context } = await admit(browser, page, data);
  await guest.evaluate(block);
  await page.locator('input[type=file]').first().setInputFiles('.cache/fixtures/barcode.mp4');
  await expect(page.locator('.ready-strip')).toBeVisible();
  await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
  await expect(page.locator('.player-state')).toContainText('正在放映', { timeout: 20000 });
  await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
  const frames = () =>
    guest
      .locator('video.remote-movie')
      .evaluate((v) => (v as HTMLVideoElement).getVideoPlaybackQuality().totalVideoFrames);
  await expect.poll(frames, { timeout: 20000 }).toBeGreaterThan(3);
  const first = await frames();
  await expect.poll(frames).toBeGreaterThan(first + 3);
  expect(
    await guest
      .locator('video.remote-movie')
      .evaluate((v) =>
        ((v as HTMLVideoElement).srcObject as MediaStream).getTracks().map((t) => t.kind),
      ),
  ).toEqual(expect.arrayContaining(['audio', 'video']));
  // The rejected call is only the isolated capability probe, not a live transport update.
  expect(await page.evaluate(() => (window as any).__configurationCalls)).toBe(1);
  expect(await guest.evaluate(() => (window as any).__configurationCalls)).toBe(1);
  await page.getByRole('button', { name: '暂停放映', exact: true }).first().click();
  await expect(guest.locator('.player-state')).toContainText('影片已暂停');
  await context.close();
});
