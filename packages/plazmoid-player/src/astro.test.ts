import type { PlayerUrls, StreamResolution } from '@xsynaptic/plazmoid-core';

import { loadedTrack } from '@xsynaptic/plazmoid-core';
import { heldPressAttribute } from '@xsynaptic/plazmoid-core/constants';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AstroPlayer, AstroPlayerConfig } from '#astro.ts';

import { startAstroPlayer } from '#astro.ts';
import { defaultLabels } from '#labels.ts';

// Inline, so happy-dom has nothing to fetch
const stylesheet = 'data:text/css,';

const payload = JSON.stringify(
	['a', 'b'].map((trackId) => ({
		artistLine: 'Fixture Artist',
		releaseTitle: 'Fixtures',
		title: `Track ${trackId}`,
		trackId,
	})),
);

const urls: PlayerUrls = {
	stream: () => Promise.withResolvers<StreamResolution>().promise,
};

const listeners: Array<Parameters<Document['addEventListener']>> = [];

function control(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`No control matches ${selector}`);

	return found;
}

function mountPage({ hasPayload }: { hasPayload: boolean }): void {
	document.body.innerHTML = `
		${hasPayload ? `<div data-pzm-payload='${payload}' hidden></div>` : ''}
		<button data-pzm-play-track="a"><span>Play a</span></button>
		<button data-pzm-queue-track="b">Queue b</button>
		<div data-pzm-host></div>
	`;
}

function stubIdle({ isIdle }: { isIdle: boolean }): void {
	vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
		if (isIdle) callback();

		return 0;
	});
	vi.stubGlobal('cancelIdleCallback', vi.fn());
}

function start(hooks?: Partial<AstroPlayerConfig>) {
	const configure = vi.fn((): AstroPlayerConfig => ({
		player: { labels: defaultLabels },
		stylesheetUrl: stylesheet,
		urls: () => urls,
		...hooks,
	}));

	startAstroPlayer(configure);

	return configure;
}

function startReady(hooks: Omit<AstroPlayerConfig, 'player' | 'stylesheetUrl' | 'urls'> = {}) {
	const ready = Promise.withResolvers<AstroPlayer>();

	start({
		load: async () => {
			const loaded = (await hooks.load?.()) ?? {};

			return {
				...loaded,
				onReady: (player) => {
					loaded.onReady?.(player);
					ready.resolve(player);
				},
			};
		},
	});

	return ready.promise;
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
	vi.stubGlobal('reportError', (error: unknown) => {
		throw error;
	});

	const addEventListener = document.addEventListener.bind(document);

	vi.spyOn(document, 'addEventListener').mockImplementation((...parameters) => {
		listeners.push(parameters);
		addEventListener(...parameters);
	});
});

afterEach(async () => {
	for (const [type, listener, options] of listeners.splice(0)) {
		document.removeEventListener(type, listener, options);
	}

	document.head.replaceChildren();
	document.body.replaceChildren();
	localStorage.clear();
	await Promise.resolve();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('startAstroPlayer', () => {
	test('a press before idle loads the player at once and is replayed by the page controls', async () => {
		stubIdle({ isIdle: false });
		mountPage({ hasPayload: true });

		const ready = startReady();

		await settle();

		expect(document.querySelector('pzm-root')).toBeNull();

		control('[data-pzm-play-track] span').click();

		expect(control('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(true);

		const { root, store } = await ready;

		expect(root.parentElement).toBe(control('[data-pzm-host]'));
		expect(loadedTrack(store.getState())?.trackId).toBe('a');
		expect(control('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
	});

	test('a later page load that brings a payload starts the player, and only once', async () => {
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: false });

		const configure = start();

		await settle();

		expect(configure).not.toHaveBeenCalled();

		document.body.insertAdjacentHTML('afterbegin', `<div data-pzm-payload='${payload}'></div>`);
		document.dispatchEvent(new Event('astro:page-load'));
		document.dispatchEvent(new Event('astro:page-load'));

		await vi.waitFor(() => {
			expect(document.querySelectorAll('[data-pzm-host] > pzm-root')).toHaveLength(1);
		});
		expect(configure).toHaveBeenCalledExactlyOnceWith(control('[data-pzm-host]'));
	});

	test('a press once the page controls are bound is theirs, and so is one from onReady', async () => {
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });

		let isHeldInReady: boolean | undefined;

		const { store } = await startReady({
			load: () =>
				Promise.resolve({
					onReady: () => {
						control('[data-pzm-queue-track]').click();
						isHeldInReady = control('[data-pzm-queue-track]').hasAttribute(heldPressAttribute);
					},
				}),
		});

		expect(isHeldInReady).toBe(false);
		expect(store.getState().queue.map(({ trackId }) => trackId)).toStrictEqual(['b']);

		control('[data-pzm-play-track]').click();

		expect(control('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
		expect(loadedTrack(store.getState())?.trackId).toBe('a');
	});

	test('urls reaches the store only once load settles, and onReady comes last', async () => {
		const steps: Array<string> = [];
		const ready = Promise.withResolvers<undefined>();

		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });
		start({
			load: async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				steps.push('load');

				return {
					onReady: () => {
						steps.push('ready');
						ready.resolve(undefined);
					},
				};
			},
			urls: () => {
				steps.push('urls');

				return urls;
			},
		});

		await ready.promise;

		expect(steps).toStrictEqual(['load', 'urls', 'ready']);
	});

	test('a load that rejects is reported, and the player still mounts and binds', async () => {
		const failure = new TypeError('Failed to fetch dynamically imported module');
		const reportError = vi.fn();
		const onPress = vi.fn();

		vi.stubGlobal('reportError', reportError);
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });
		start({ load: () => Promise.reject(failure) });

		await vi.waitFor(() => {
			expect(document.querySelector('[data-pzm-host] > pzm-root')).not.toBeNull();
		});

		control('[data-pzm-play-track]').click();

		expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
		expect(onPress).not.toHaveBeenCalled();
		expect(control('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
	});

	test('an onReady that throws is reported, after the press handler is bound', async () => {
		const failure = new Error('Analytics failed to bind');
		const reportError = vi.fn();
		const onPress = vi.fn();

		vi.stubGlobal('reportError', reportError);
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });
		start({
			load: () =>
				Promise.resolve({
					onPress,
					onReady: () => {
						throw failure;
					},
				}),
		});

		await vi.waitFor(() => {
			expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
		});

		control('[data-pzm-play-track]').click();

		expect(onPress).toHaveBeenCalledExactlyOnceWith({ trackIds: ['a'], verb: 'play-track' });
	});
});
