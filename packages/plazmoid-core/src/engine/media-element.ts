import type { PlayerStoreApi } from '#store/player-types.ts';

export function whenMediaElement(store: PlayerStoreApi): Promise<HTMLMediaElement> {
	return new Promise((resolve) => {
		const element = store.getState().getMediaElement();

		if (element) {
			resolve(element);
			return;
		}

		const unsubscribe = store.subscribe((state) => {
			const loaded = state.getMediaElement();
			if (!loaded) return;

			unsubscribe();
			resolve(loaded);
		});
	});
}
