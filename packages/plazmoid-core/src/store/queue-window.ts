import type { PlayerState } from '#store/player-types.ts';
import type { QueuedTrack } from '#types.ts';

import { nextInOrder } from '#queue/queue.ts';

type WindowState = Pick<PlayerState, 'currentIndex' | 'playOrder' | 'queue' | 'urls'>;

// Only the displayed and next tracks are read, so the rest of a long queue costs no requests
export function windowTracks(state: WindowState): Array<QueuedTrack> {
	const displayedIndex = state.currentIndex ?? state.playOrder[0];
	if (displayedIndex === undefined) return [];

	const nextIndex = nextInOrder(state.playOrder, displayedIndex);
	const displayed = state.queue[displayedIndex];
	const next = nextIndex === undefined ? undefined : state.queue[nextIndex];

	return [displayed, next].filter((track) => track !== undefined);
}

export function isWindowMoved(state: WindowState, previous: WindowState): boolean {
	return (
		state.queue !== previous.queue ||
		state.currentIndex !== previous.currentIndex ||
		state.playOrder !== previous.playOrder ||
		state.urls !== previous.urls
	);
}
