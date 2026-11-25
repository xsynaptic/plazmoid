import type { PlayerUrls, StreamResolution, Track } from '@xsynaptic/plazmoid-core';

import { loadedTrack } from '@xsynaptic/plazmoid-core';
import { heldPressAttribute } from '@xsynaptic/plazmoid-core/constants';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AstroPlayer, AstroPlayerConfig, AstroPlayerHooks } from '#astro.ts';

import { startAstroPlayer } from '#astro.ts';
import { defaultLabels } from '#labels.ts';
import { LazyModuleError } from '#lib/lazy-module.ts';

// Inline, so happy-dom has nothing to fetch
const stylesheet = 'data:text/css,';

function row(trackId: string): Track {
	return {
		artistLine: 'Fixture Artist',
		releaseTitle: 'Fixtures',
		title: `Track ${trackId}`,
		trackId,
	};
}

const payload = JSON.stringify(['a', 'b'].map((trackId) => row(trackId)));

const urls: PlayerUrls = {
	stream: () => Promise.withResolvers<StreamResolution>().promise,
};

const listeners: Array<{
	parameters: Parameters<EventTarget['addEventListener']>;
	target: EventTarget;
}> = [];

function control(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`No control matches ${selector}`);

	return found;
}

function mountPage({
	hasControls = true,
	hasPayload,
	host = '',
}: {
	hasControls?: boolean;
	hasPayload: boolean;
	host?: string;
}): void {
	document.body.innerHTML = `
		${hasPayload ? `<div data-pzm-payload='${payload}' hidden></div>` : ''}
		${hasControls ? '<button data-pzm-play-track="a"><span>Play a</span></button><button data-pzm-queue-track="b">Queue b</button>' : ''}
		<div data-pzm-host>${host}</div>
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
		...hooks,
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

	// Each mounted player binds to both, and a listener left over from an earlier test reaches the next one
	for (const target of [document, window] satisfies Array<EventTarget>) {
		const addEventListener = target.addEventListener.bind(target);

		vi.spyOn(target, 'addEventListener').mockImplementation((...parameters) => {
			listeners.push({ parameters, target });
			addEventListener(...parameters);
		});
	}
});

afterEach(async () => {
	for (const { parameters, target } of listeners.splice(0)) {
		target.removeEventListener(...parameters);
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
		mountPage({ hasControls: false, hasPayload: false });

		const configure = start();

		await settle();

		expect(configure).not.toHaveBeenCalled();

		document.body.insertAdjacentHTML('afterbegin', `<div data-pzm-payload='${payload}'></div>`);
		document.dispatchEvent(new Event('astro:page-load'));
		document.dispatchEvent(new Event('astro:page-load'));

		await vi.waitFor(() => {
			expect(document.querySelectorAll('[data-pzm-host] > pzm-root')).toHaveLength(1);
		});
		expect(configure).toHaveBeenCalledExactlyOnceWith(control('[data-pzm-host]'), undefined);
	});

	test('a page with a control and no payload boots the player, and a press plays the row the host resolves', async () => {
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: false });

		const tracks = vi.fn((trackIds: ReadonlyArray<string>) =>
			Promise.resolve(trackIds.map((trackId) => row(trackId))),
		);
		const ready = Promise.withResolvers<AstroPlayer>();

		start({
			load: () =>
				Promise.resolve({
					onReady: (player) => {
						ready.resolve(player);
					},
				}),
			urls: () => ({ ...urls, tracks }),
		});

		const { store } = await ready.promise;

		control('[data-pzm-play-track]').click();

		await vi.waitFor(() => {
			expect(loadedTrack(store.getState())?.trackId).toBe('a');
		});
		expect(tracks).toHaveBeenCalledExactlyOnceWith(['a']);
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

	test('the seek seconds reach the store before the bar connects and reads them', async () => {
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });

		const { root } = await startReady({ seekSeconds: 15 });

		expect(root.querySelector('pzm-seek-button')?.getAttribute('seconds')).toBe('-15');
	});

	test('playback failures, opened parts and failed chunks all reach onEvent', async () => {
		const events: Array<Parameters<NonNullable<AstroPlayerHooks['onEvent']>>[0]> = [];

		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });

		const { store, view } = await startReady({
			load: () =>
				Promise.resolve({
					onEvent: (event) => {
						events.push(event);
					},
				}),
		});

		store.getState().configure({ urls: { stream: () => Promise.resolve({ status: 'capped' }) } });
		control('[data-pzm-play-track]').click();
		view.getState().setOverlayOpen(true);
		view.getState().setPanelOpen(true);
		window.dispatchEvent(new ErrorEvent('error', { error: new Error('Not a chunk') }));
		window.dispatchEvent(
			new ErrorEvent('error', { error: new LazyModuleError('tray', 'offline') }),
		);

		await vi.waitFor(() => {
			expect(events).toContainEqual({
				error: undefined,
				kind: 'failed',
				status: 'capped',
				trackId: 'a',
			});
		});
		expect(events.filter((event) => event.kind !== 'failed')).toStrictEqual([
			{ kind: 'opened', part: 'overlay' },
			{ kind: 'opened', part: 'panel' },
			{ chunk: 'tray', kind: 'chunk-failed', reason: 'offline' },
		]);
	});

	test('an onEvent that throws is reported, and the next event still reaches it', async () => {
		const failure = new Error('Analytics failed');
		const reportError = vi.fn();
		const onEvent = vi.fn(() => {
			throw failure;
		});

		vi.stubGlobal('reportError', reportError);
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });

		const { view } = await startReady({ load: () => Promise.resolve({ onEvent }) });

		view.getState().setOverlayOpen(true);
		view.getState().setPanelOpen(true);

		expect(onEvent).toHaveBeenCalledTimes(2);
		expect(reportError).toHaveBeenCalledTimes(2);
		expect(reportError).toHaveBeenCalledWith(failure);
		expect(view.getState().isPanelOpen).toBe(true);
	});

	test("hands configure the host's JSON script, parsed", async () => {
		stubIdle({ isIdle: true });
		mountPage({
			hasPayload: true,
			host: '<script type="application/json">{"libraryUrl":"/library.json"}</script>',
		});

		const configure = start();

		await vi.waitFor(() => {
			expect(configure).toHaveBeenCalledExactlyOnceWith(control('[data-pzm-host]'), {
				libraryUrl: '/library.json',
			});
		});
	});

	test('a script that fails to parse is reported once, and the host is not started', async () => {
		const reportError = vi.fn();

		vi.stubGlobal('reportError', reportError);
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true, host: '<script type="application/json">{"labels":</script>' });

		const configure = start();

		document.dispatchEvent(new Event('astro:page-load'));
		await settle();

		expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.any(SyntaxError));
		expect(configure).not.toHaveBeenCalled();
		expect(document.querySelector('pzm-root')).toBeNull();
	});

	test('a load that rejects is reported, and the player still mounts and binds', async () => {
		const failure = new TypeError('Failed to fetch dynamically imported module');
		const reportError = vi.fn();

		vi.stubGlobal('reportError', reportError);
		stubIdle({ isIdle: true });
		mountPage({ hasPayload: true });
		start({ load: () => Promise.reject(failure) });

		const root = await vi.waitFor(() => control('[data-pzm-host] > pzm-root'));

		control('[data-pzm-play-track]').click();

		expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
		expect(control('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
		expect(root.dataset.empty).toBeUndefined();
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
