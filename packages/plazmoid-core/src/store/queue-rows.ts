import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { Track } from '#types.ts';

import { isWindowMoved, windowTracks } from '#store/queue-window.ts';
import { resolveTracks } from '#store/resolve-tracks.ts';

// A restored row can predate this build; each is asked for once per document
export function bindQueueRows(api: StoreApi<PlayerStore>): void {
	const stale = new Set(api.getState().queue.map((track) => track.trackId));
	if (stale.size === 0) return;

	async function land(resolving: Promise<Array<Track>>): Promise<void> {
		let tracks: Array<Track>;

		try {
			tracks = await resolving;
		} catch {
			return;
		}

		api.getState().refreshQueue(tracks);
	}

	function heal(): void {
		const state = api.getState();
		const queuedIds = new Set(state.queue.map((track) => track.trackId));

		// A track removed and queued again already carries a fresh row
		for (const trackId of stale) {
			if (!queuedIds.has(trackId)) stale.delete(trackId);
		}

		const resolve = state.urls?.tracks;
		if (!resolve) return;

		const trackIds = windowTracks(state)
			.map((track) => track.trackId)
			.filter((trackId) => stale.has(trackId));
		if (trackIds.length === 0) return;

		for (const trackId of trackIds) stale.delete(trackId);

		void land(resolveTracks(resolve, trackIds));
	}

	heal();

	const unsubscribe = api.subscribe((state, previous) => {
		if (!isWindowMoved(state, previous)) return;

		heal();
		if (stale.size === 0) unsubscribe();
	});
}
