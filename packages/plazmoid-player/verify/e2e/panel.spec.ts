import type { Page } from '@playwright/test';

import { expect, test } from '#e2e/test.ts';
import { defaultLabels } from '#labels.ts';

// The placeholder animates otherwise, and its frames ask again whether or not the promise settles
test.use({ reducedMotion: 'reduce' });

async function openPausedPanel(page: Page, isMobile: boolean): Promise<void> {
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: defaultLabels.pause }).click();
	if (isMobile) await page.getByRole('button', { exact: true, name: defaultLabels.expand }).click();
	await page.evaluate(() => window.playerPage?.view.getState().setPanelOpen(true));
}

function readZoom(page: Page): Promise<number | undefined> {
	return page.evaluate(() => window.playerPage?.view.getState().panelPxPerSecond);
}

test('a paused panel asks again for a chunk that failed, and paints it with no input', async ({
	consoleGuard,
	harness,
	isMobile,
	page,
}) => {
	const waveform = page.locator('sonic-waveform:has(:visible)');
	const isPending = () =>
		waveform.evaluate((element) => element.querySelector('[data-sonic-pending]') !== null);
	let chunkRequests = 0;

	consoleGuard.allow(
		/Failed to load resource/,
		/due to access control checks/,
		/Cross-Origin Request Blocked/,
	);

	await page.route(/\.wavedata\?/, async (route) => {
		if (route.request().method() !== 'GET') {
			await route.continue();
			return;
		}

		chunkRequests += 1;

		if (chunkRequests === 1) await route.abort();
		else await route.continue();
	});

	await harness.open({ query: { waveform: 1 } });
	await openPausedPanel(page, isMobile);

	await expect.poll(isPending).toBe(true);
	expect(chunkRequests).toBe(1);
	await expect(waveform).not.toHaveJSProperty('pending', []);

	await expect.poll(isPending, { timeout: 10_000 }).toBe(false);
	expect(chunkRequests).toBe(2);
	await expect(waveform).toHaveJSProperty('pending', []);
	expect(await harness.read()).toMatchObject({ isPaused: true });
});

test('the zoom keys and the wheel set the panel scale', async ({ harness, isMobile, page }) => {
	const control = page.locator('sonic-waveform:has(:visible)').getByRole('slider');

	await harness.open({ query: { waveform: 1 } });
	await openPausedPanel(page, isMobile);

	await control.focus();
	await page.keyboard.press('+');
	await expect.poll(() => readZoom(page)).toBe(89.88);

	await page.keyboard.press('-');
	await page.keyboard.press('-');
	await expect.poll(() => readZoom(page)).toBe(54.52);

	// Playwright has no wheel in mobile WebKit
	if (!isMobile) {
		await control.hover();
		await page.mouse.wheel(0, -100);
		await expect.poll(() => readZoom(page)).toBeGreaterThan(54.52);
	}
});

test('a two-finger pinch zooms the panel without seeking', async ({
	browserName,
	harness,
	isMobile,
	page,
}) => {
	test.skip(browserName !== 'chromium', 'Two touch points need the DevTools protocol');

	const control = page.locator('sonic-waveform:has(:visible)').getByRole('slider');
	const devtools = await page.context().newCDPSession(page);

	await harness.open({ query: { waveform: 1 } });
	await openPausedPanel(page, isMobile);

	const box = await control.boundingBox();
	if (!box) throw new Error('The waveform has no box');

	const y = box.y + box.height / 2;
	const middle = box.x + box.width / 2;
	const fingers = (spread: number) => [
		{ id: 1, x: middle - spread, y },
		{ id: 2, x: middle + spread, y },
	];
	const before = await harness.read();

	await devtools.send('Input.dispatchTouchEvent', {
		touchPoints: fingers(40).slice(0, 1),
		type: 'touchStart',
	});
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: fingers(40), type: 'touchStart' });
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: fingers(60), type: 'touchMove' });
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: fingers(80), type: 'touchMove' });
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });

	await expect.poll(() => readZoom(page)).toBe(140);

	const after = await harness.read();

	expect(after.currentTimeSeconds).toBe(before.currentTimeSeconds);
});
