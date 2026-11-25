import type {
	PlayerPress,
	PlayerStatus,
	PlayerStore,
	PlayerStoreApi,
} from '@xsynaptic/plazmoid-core';

import { audibleVolume, bind, isAwaitingPlayback, isDetailPending } from '@xsynaptic/plazmoid-core';

import type { PlayerLabels } from '#types.ts';
import type { ViewStoreApi } from '#view/view-store.ts';

import { PlayerElement } from '#elements/player-element.ts';

interface RootView {
	isEmpty: boolean;
	isMuted: boolean;
	isPaused: boolean;
	isPending: boolean;
	isWaiting: boolean;
	status: PlayerStatus;
}

// Declared beside the class, so the one tag a host holds by its properties is typed in a host too
declare global {
	interface HTMLElementTagNameMap {
		'pzm-root': PlayerRoot;
	}
}

const rootAttributes = {
	isEmpty: 'data-empty',
	isMuted: 'data-muted',
	isPaused: 'data-paused',
	isPending: 'data-pending',
	isWaiting: 'data-waiting',
} as const satisfies Record<Exclude<keyof RootView, 'status'>, `data-${string}`>;

export class PlayerRoot extends PlayerElement {
	get isArtworkEnabled(): boolean {
		return this.#isArtworkEnabled;
	}

	set isArtworkEnabled(isArtworkEnabled: boolean) {
		this.#isArtworkEnabled = isArtworkEnabled;
	}

	get isOverlayEnabled(): boolean {
		return this.#isOverlayEnabled;
	}

	set isOverlayEnabled(isOverlayEnabled: boolean) {
		this.#isOverlayEnabled = isOverlayEnabled;
	}

	get isPanelEnabled(): boolean {
		return this.#isPanelEnabled;
	}

	set isPanelEnabled(isPanelEnabled: boolean) {
		this.#isPanelEnabled = isPanelEnabled;
	}

	get isScopeEnabled(): boolean {
		return this.#isScopeEnabled;
	}

	set isScopeEnabled(isScopeEnabled: boolean) {
		this.#isScopeEnabled = isScopeEnabled;
	}

	get labels(): PlayerLabels | undefined {
		return this.#labels;
	}

	set labels(labels: PlayerLabels | undefined) {
		this.#labels = labels;
	}

	get onPress(): ((press: PlayerPress) => void) | undefined {
		return this.#onPress;
	}
	set onPress(onPress: ((press: PlayerPress) => void) | undefined) {
		this.#onPress = onPress;
	}

	get store(): PlayerStoreApi | undefined {
		return this.#store;
	}

	set store(store: PlayerStoreApi | undefined) {
		this.#store = store;
	}

	get view(): undefined | ViewStoreApi {
		return this.#view;
	}

	set view(view: undefined | ViewStoreApi) {
		this.#view = view;
	}

	#isArtworkEnabled = true;

	#isOverlayEnabled = true;
	#isPanelEnabled = true;
	#isScopeEnabled = false;

	#labels: PlayerLabels | undefined;

	#onPress: ((press: PlayerPress) => void) | undefined;

	#store: PlayerStoreApi | undefined;

	#view: undefined | ViewStoreApi;

	protected connect(signal: AbortSignal): void {
		this.upgradeProperty('isArtworkEnabled');
		this.upgradeProperty('isOverlayEnabled');
		this.upgradeProperty('isPanelEnabled');
		this.upgradeProperty('isScopeEnabled');
		this.upgradeProperty('labels');
		this.upgradeProperty('onPress');
		this.upgradeProperty('store');
		this.upgradeProperty('view');

		const store = this.#store;
		if (!store) throw new Error('<pzm-root> connected without a store');

		bind(
			store,
			selectRoot,
			(view) => {
				applyRoot(this, view);
			},
			signal,
		);
	}
}

function applyRoot(root: HTMLElement, view: RootView): void {
	root.dataset.status = view.status;
	root.toggleAttribute(rootAttributes.isEmpty, view.isEmpty);
	root.toggleAttribute(rootAttributes.isMuted, view.isMuted);
	root.toggleAttribute(rootAttributes.isPaused, view.isPaused);
	root.toggleAttribute(rootAttributes.isPending, view.isPending);
	root.toggleAttribute(rootAttributes.isWaiting, view.isWaiting);
}

function selectRoot(state: PlayerStore): RootView {
	return {
		isEmpty: state.queue.length === 0,
		isMuted: audibleVolume(state) === 0,
		isPaused: state.isPaused,
		isPending: isDetailPending(state),
		isWaiting: isAwaitingPlayback(state),
		status: state.status,
	};
}
