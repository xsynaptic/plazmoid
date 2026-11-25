import type {
	ControlPress,
	PageControls,
	PlaybackEvent,
	PlayerStoreApi,
	PlayerUrls,
} from '@xsynaptic/plazmoid-core';

import { holdPresses, isPlayerActionable } from '@xsynaptic/plazmoid-core/boot';

import type { PlayerOptions } from '#elements/create-player.ts';
import type { PlayerRoot } from '#elements/player-root.ts';
import type { LazyModuleError } from '#lib/lazy-module.ts';
import type { ViewStoreApi } from '#view/view-store.ts';

import { bindAstroRouter, loadPersistedStylesheet } from '#lib/astro-router.ts';

export interface AstroPlayer {
	controls: PageControls;
	root: PlayerRoot;
	store: PlayerStoreApi;
	view: ViewStoreApi;
}

export interface AstroPlayerConfig {
	load?: () => Promise<AstroPlayerHooks>;
	player: Omit<PlayerOptions, 'store' | 'view'>;
	seekSeconds?: number;
	stylesheetUrl: string;
	urls: (store: PlayerStoreApi) => PlayerUrls;
}

export interface AstroPlayerHooks {
	onEvent?: (event: PlaybackEvent | PlayerEvent) => void;
	onPress?: (press: ControlPress) => void;
	onReady?: (player: AstroPlayer) => void;
}

export type PlayerEvent =
	| { chunk: string; kind: 'chunk-failed'; reason: 'import' | 'offline' }
	| { kind: 'opened'; part: 'overlay' | 'panel' };

const hostSelector = '[data-pzm-host]';

const idleFallbackMs = 200;

const started = new WeakSet<Element>();

export function startAstroPlayer(
	configure: (host: Element, data: unknown) => AstroPlayerConfig,
): void {
	const start = async (): Promise<void> => {
		const host = document.querySelector(hostSelector);
		if (!host || started.has(host) || !isPlayerActionable(document)) return;

		// Marked before parsing, so a script that fails is reported once, not on every navigation
		started.add(host);

		try {
			await mountPlayer(host, configure(host, readHostData(host)));
		} catch (error) {
			reportError(error);
		}
	};

	void start();
	document.addEventListener('astro:page-load', () => {
		void start();
	});
}

async function mountPlayer(
	host: Element,
	{ load, player, seekSeconds, stylesheetUrl, urls }: AstroPlayerConfig,
): Promise<void> {
	const presses = holdPresses(document);
	const stylesheet = loadPersistedStylesheet(stylesheetUrl);

	await Promise.race([whenIdle(), presses.pressed]);

	const [
		,
		core,
		{ createPlayer, createViewStore, LazyModuleError: chunkError },
		{ onEvent, onPress, onReady },
	] = await Promise.all([
		stylesheet,
		import('@xsynaptic/plazmoid-core'),
		import('#index.ts'),
		loadHooks(load),
	]);

	const store = core.createPlayerStore();
	const view = createViewStore();

	store.getState().configure({ seekSeconds, urls: urls(store) });
	if (onEvent) {
		const send = guarded(onEvent);

		core.bindPlaybackEvents(store, send);
		bindPlayerEvents(view, chunkError, send);
	}

	const root = createPlayer({ ...player, store, view });

	host.append(root);

	const controls = core.bindPageControls(store, document, { onPress });

	presses.release();
	bindAstroRouter(view, controls);
	// Once per document, since Safari reconnects the persisted root on every navigation and a root's binding would clear the lock screen each time
	core.bindMediaSession(store);
	onReady?.({ controls, root, store, view });
}

// A failed chunk reaches the host only through `reportError`, which fires `error` on the window
function bindPlayerEvents(
	view: ViewStoreApi,
	chunkError: typeof LazyModuleError,
	send: (event: PlayerEvent) => void,
): void {
	view.subscribe((next, previous) => {
		if (next.isOverlayOpen && !previous.isOverlayOpen) send({ kind: 'opened', part: 'overlay' });
		if (next.isPanelOpen && !previous.isPanelOpen) send({ kind: 'opened', part: 'panel' });
	});
	window.addEventListener('error', ({ error }: ErrorEvent) => {
		if (error instanceof chunkError) {
			send({ chunk: error.chunk, kind: 'chunk-failed', reason: error.reason });
		}
	});
}

function guarded<Event>(handler: (event: Event) => void): (event: Event) => void {
	return (event) => {
		try {
			handler(event);
		} catch (error) {
			reportError(error);
		}
	};
}

function readHostData(host: Element): unknown {
	const script = host.querySelector(':scope > script[type="application/json"]');
	if (!script) return undefined;

	const data: unknown = JSON.parse(script.textContent);

	return data;
}

async function loadHooks(load: AstroPlayerConfig['load']): Promise<AstroPlayerHooks> {
	if (!load) return {};

	try {
		return await load();
	} catch (error) {
		reportError(error);
		return {};
	}
}

function whenIdle(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(() => {
				resolve();
			});
			return;
		}

		setTimeout(resolve, idleFallbackMs);
	});
}
