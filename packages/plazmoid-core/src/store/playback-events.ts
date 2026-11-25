import type { TerminalStatus } from '#store/playback-controller.ts';
import type { PlayerStore, PlayerStoreApi } from '#store/player-types.ts';
import type { PlaybackDiagnostic, PlaybackError } from '#types.ts';

import { guarded } from '#lib/guarded.ts';
import { isTerminalStatus } from '#store/playback-controller.ts';
import { loadedTrack } from '#store/selectors.ts';

// `error` is `undefined` on `capped` and `unplayable`, where nothing failed to load
export type PlaybackEvent =
	| { diagnostic: PlaybackDiagnostic; kind: 'diagnostic' }
	| {
			error: PlaybackError | undefined;
			kind: 'failed';
			status: TerminalStatus;
			trackId: string | undefined;
	  };

export function bindPlaybackEvents(
	store: PlayerStoreApi,
	listener: (event: PlaybackEvent) => void,
): () => void {
	// A throw would escape into whichever action wrote the state, and skip the rest of it
	const send = guarded(listener);

	return store.subscribe((state, previous) => {
		for (const event of playbackEvents(state, previous)) send(event);
	});
}

function playbackEvents(state: PlayerStore, previous: PlayerStore): Array<PlaybackEvent> {
	const events: Array<PlaybackEvent> = [];

	if (state.diagnostic && state.diagnostic !== previous.diagnostic) {
		events.push({ diagnostic: state.diagnostic, kind: 'diagnostic' });
	}

	if (state.status !== previous.status && isTerminalStatus(state.status)) {
		events.push({
			error: state.playbackError,
			kind: 'failed',
			status: state.status,
			trackId: loadedTrack(state)?.trackId,
		});
	}

	return events;
}
