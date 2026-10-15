import { test, expect } from '@playwright/test';
import { createHost, admit } from './helpers';
import { writeFileSync, mkdirSync } from 'node:fs';

test.skip(!process.env.PUBLIC_E2E_URL, 'Opt-in only: run with playwright.public.config.ts');
for (const delivery of ['direct', 'relay'] as const) {
  test(`deployed HTTPS ${delivery}: admission, actual decoded video/audio, pause and removal`, async ({
    page,
    browser,
  }) => {
    const faults: string[] = [];
    page.on('pageerror', (e) => faults.push(e.message));
    const data = await createHost(page, delivery);
    const { guest, context } = await admit(browser, page, data);
    guest.on('pageerror', (e) => faults.push(e.message));
    try {
      await page.locator('input[type=file]').first().setInputFiles('.cache/fixtures/barcode.mp4');
      await expect(page.locator('.ready-strip')).toBeVisible();
      await page.getByRole('button', { name: '开始放映', exact: true }).first().click();
      await expect(page.locator('.player-state')).toContainText('正在放映');
      await guest.getByRole('button', { name: '开始观看', exact: true }).first().click();
      const frames = () =>
        guest
          .locator('video.remote-movie')
          .evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames);
      await expect.poll(frames).toBeGreaterThan(5);
      const before = await frames();
      await expect.poll(frames).toBeGreaterThan(before + 8);
      await expect(guest.locator('.connection-notice')).toContainText(
        delivery === 'direct' ? '优先直连' : '云端转发',
      );
      const rms = await guest
        .locator('video.remote-movie')
        .evaluate(async (v: HTMLVideoElement) => {
          const stream = v.srcObject as MediaStream,
            audio = new AudioContext(),
            analyser = audio.createAnalyser();
          audio.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
          await audio.resume();
          await new Promise((r) => setTimeout(r, 500));
          const values = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(values);
          const level = Math.sqrt(values.reduce((s, x) => s + x * x, 0) / values.length);
          await audio.close();
          return level;
        });
      expect(rms).toBeGreaterThan(0.005);
      const cookie = (await page.context().cookies()).find((c) => c.name === 'interlude')!;
      expect(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict').toBe(true);
      await page.getByRole('button', { name: '开启麦克风', exact: true }).click();
      await expect.poll(() => guest.locator('audio[data-voice]').count()).toBeGreaterThan(0);
      await page.getByRole('button', { name: '关闭麦克风', exact: true }).click();
      await page.getByRole('button', { name: '暂停放映', exact: true }).click();
      await expect(guest.locator('.player-state')).toContainText('影片已暂停');
      await expect(page.locator('.error-banner')).toHaveCount(0);
      await expect(guest.locator('.error-banner')).toHaveCount(0);
      mkdirSync('artifacts', { recursive: true });
      await page.screenshot({ path: `artifacts/public-${delivery}.png`, fullPage: true });
      const health = await page.request.get('/api/health');
      const status = await health.json();
      expect(status.storage).toBe(true);
      if (delivery === 'relay') expect(status.media).toBe(true);
      await page.getByRole('button', { name: /座位/ }).click();
      await page.getByRole('button', { name: '移除 阿远', exact: true }).click();
      await expect(guest.getByRole('alert')).toContainText('已离开');
      expect(faults).toEqual([]);
      writeFileSync(
        `artifacts/public-${delivery}.json`,
        JSON.stringify(
          {
            origin: new URL(page.url()).origin,
            delivery,
            decodedFrames: true,
            filmAudioRms: rms,
            secureSession: true,
            removedGuest: true,
            network:
              'Two isolated Chromium contexts on one Windows machine; public Render signaling; LiveKit Cloud for relay. No physical phone or separate-ISP claim.',
          },
          null,
          2,
        ),
      );
    } finally {
      await context.close();
      const settings = page.getByRole('button', { name: '房间设置', exact: true });
      if (await settings.isVisible()) {
        await settings.click();
        await page.getByRole('button', { name: '结束本次放映', exact: true }).click();
        await page.getByRole('button', { name: '结束放映', exact: true }).click();
      }
    }
  });
}
