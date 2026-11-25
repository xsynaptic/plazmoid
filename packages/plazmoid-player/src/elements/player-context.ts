import type { PlayerPress, PlayerStoreApi } from '@xsynaptic/plazmoid-core';

import { guarded } from '@xsynaptic/plazmoid-core';

import type { PlayerRoot } from '#elements/player-root.ts';
import type { PlayerLabels } from '#types.ts';
import type { ViewStoreApi } from '#view/view-store.ts';

export interface PlayerContext {
	labels: PlayerLabels;
	report: (press: PlayerPress | undefined) => void;
	root: PlayerRoot;
	store: PlayerStoreApi;
	view: ViewStoreApi;
}

export function controlOrigin(element: Element): 'bar' | 'overlay' {
	return element.closest('pzm-overlay') ? 'overlay' : 'bar';
}

export function playbackStore({ store }: PlayerContext): PlayerStoreApi {
	return store;
}

// Thrown rather than skipped, so a tag placed outside a root fails where it was placed
export function playerContext(element: Element): PlayerContext {
	const root = element.closest('pzm-root');

	if (!root?.store || !root.view || !root.labels) {
		throw new Error(
			`<${element.localName}> sits outside a <pzm-root> holding a store, a view store and labels`,
		);
	}

	const report = guarded((press: PlayerPress | undefined) => {
		if (press) root.onPress?.(press);
	});

	return { labels: root.labels, report, root, store: root.store, view: root.view };
}

export function viewStore({ view }: PlayerContext): ViewStoreApi {
	return view;
}
