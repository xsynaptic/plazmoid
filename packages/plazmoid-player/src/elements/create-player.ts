import type { PlayerPress, PlayerStoreApi } from '@xsynaptic/plazmoid-core';

import type { PlayerRoot } from '#elements/player-root.ts';
import type { PlayerLabels } from '#types.ts';
import type { ViewStoreApi } from '#view/view-store.ts';

import { definePlayerElements } from '#elements/define.ts';

export interface PlayerOptions {
	isArtworkEnabled?: boolean;
	isOverlayEnabled?: boolean;
	isPanelEnabled?: boolean;
	isScopeEnabled?: boolean;
	labels: PlayerLabels;
	onPress?: (press: PlayerPress) => void;
	store: PlayerStoreApi;
	view: ViewStoreApi;
}

export function createPlayer({
	isArtworkEnabled,
	isOverlayEnabled,
	isPanelEnabled,
	isScopeEnabled,
	labels,
	onPress,
	store,
	view,
}: PlayerOptions): PlayerRoot {
	definePlayerElements();

	const root = document.createElement('pzm-root');

	root.labels = labels;
	root.store = store;
	root.view = view;
	if (onPress) root.onPress = onPress;
	if (isArtworkEnabled !== undefined) root.isArtworkEnabled = isArtworkEnabled;
	if (isOverlayEnabled !== undefined) root.isOverlayEnabled = isOverlayEnabled;
	if (isPanelEnabled !== undefined) root.isPanelEnabled = isPanelEnabled;
	if (isScopeEnabled !== undefined) root.isScopeEnabled = isScopeEnabled;
	root.append(document.createElement('pzm-bar'));

	return root;
}
