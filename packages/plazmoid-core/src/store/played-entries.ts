import type { PlayerStoreApi } from '#store/player-types.ts';

import { isTerminalStatus } from '#store/playback-controller.ts';
import { loadedTrack } from '#store/selectors.ts';

interface PlayedEntries {
	bind: (store: PlayerStoreApi) => void;
	hasPlayed: (queueId: string) => boolean;
}

// A switch, an unload or a failure means the next play loads the track again
export function createPlayedEntries(): PlayedEntries {
	let playedQueueId: string | undefined;

	return {
		bind: (store) => {
			store.subscribe((state) => {
				const queueId = loadedTrack(state)?.queueId;

				if (state.status === 'playing') {
					playedQueueId = queueId;
					return;
				}

				if (
					queueId !== playedQueueId ||
					state.status === 'idle' ||
					isTerminalStatus(state.status)
				) {
					playedQueueId = undefined;
				}
			});
		},
		hasPlayed: (queueId) => queueId === playedQueueId,
	};
}
