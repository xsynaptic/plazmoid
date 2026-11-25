import { expect, expectAdvancing, test } from '#e2e/test.ts';

declare global {
	interface Window {
		mediaSessionCalls?: { positionReports: number };
	}
}

test.beforeEach(async ({ harness, page }) => {
	await page.addInitScript(() => {
		if (!('mediaSession' in navigator)) return;

		const session = navigator.mediaSession;
		const calls = { positionReports: 0 };
		const nativeSetPositionState = session.setPositionState.bind(session);

		// On the prototype, since WebKit can collect the session's wrapper and hand back a fresh one without the override
		Object.defineProperty(window, 'mediaSessionCalls', { value: calls });
		MediaSession.prototype.setPositionState = (state) => {
			calls.positionReports += 1;
			nativeSetPositionState(state);
		};
	});
	await harness.open();
	test.skip(
		!(await page.evaluate(() => 'mediaSession' in navigator)),
		'This engine has no Media Session',
	);
});

// The unit suite's MediaMetadata is a stand-in that records its init; this is the check against the platform's own
test('the platform holds the metadata once playback starts', async ({ harness, page }) => {
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const metadata = await page.evaluate(() => {
		const current = navigator.mediaSession.metadata;

		return (
			current instanceof MediaMetadata && {
				artworkCount: current.artwork.length,
				title: current.title,
			}
		);
	});

	expect(metadata).toEqual({ artworkCount: 1, title: 'Long fixture' });
});

test('steady playback reports its position rarely', async ({ harness, page }) => {
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const readReports = (): Promise<number> =>
		page.evaluate(() => window.mediaSessionCalls?.positionReports ?? 0);
	const before = await readReports();

	await page.waitForTimeout(5000);

	expect(await harness.read()).toMatchObject({ status: 'playing' });
	const after = await readReports();

	expect(after - before).toBeLessThanOrEqual(3);
});
