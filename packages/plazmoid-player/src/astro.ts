import type {
	ControlPress,
	PageControls,
	PlayerStoreApi,
	PlayerUrls,
} from '@xsynaptic/plazmoid-core';

import { holdPresses, isPlayerActionable } from '@xsynaptic/plazmoid-core/boot';

import type { PlayerOptions } from '#elements/create-player.ts';
import type { PlayerRoot } from '#elements/player-root.ts';
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
	player: Omit<PlayerOptions, 'store' | 'urls' | 'view'>;
	stylesheetUrl: string;
	urls: (store: PlayerStoreApi) => PlayerUrls;
}

export interface AstroPlayerHooks {
	onPress?: (press: ControlPress) => void;
	onReady?: (player: AstroPlayer) => void;
}

const hostSelector = '[data-pzm-host]';

const idleFallbackMs = 200;

const started = new WeakSet<Element>();

export function startAstroPlayer(configure: (host: Element) => AstroPlayerConfig): void {
	const start = async (): Promise<void> => {
		const host = document.querySelector(hostSelector);
		if (!host || started.has(host) || !isPlayerActionable(document)) return;

		started.add(host);

		try {
			await mountPlayer(host, configure(host));
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
	{ load, player, stylesheetUrl, urls }: AstroPlayerConfig,
): Promise<void> {
	const presses = holdPresses(document);
	const stylesheet = loadPersistedStylesheet(stylesheetUrl);

	await Promise.race([whenIdle(), presses.pressed]);

	const [, core, { createPlayer, createViewStore }, { onPress, onReady }] = await Promise.all([
		stylesheet,
		import('@xsynaptic/plazmoid-core'),
		import('#index.ts'),
		loadHooks(load),
	]);

	const store = core.createPlayerStore();
	const view = createViewStore();
	const root = createPlayer({ ...player, store, urls: urls(store), view });

	host.append(root);

	const controls = core.bindPageControls(store, document, { onPress });

	presses.release();
	bindAstroRouter(view, controls);
	// Once per document, since Safari reconnects the persisted root on every navigation and a root's binding would clear the lock screen each time
	core.bindMediaSession(store);
	onReady?.({ controls, root, store, view });
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
