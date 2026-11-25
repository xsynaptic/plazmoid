import type { PlayerStore } from '#store/player-types.ts';

import { displayedTrack } from '#store/selectors.ts';

type StepOrigin = 'bar' | 'media-session' | 'overlay';

export type PressOrigin = 'bar' | 'media-session' | 'overlay' | 'page' | 'tray';

export type PlayerPress =
	| { action: 'clear'; origin: 'tray'; trackCount: number }
	| { action: 'move'; from: number; origin: 'tray'; to: number; trackId: string }
	| {
			action: 'next' | 'previous';
			origin: StepOrigin;
			trackId: string;
	  }
	| { action: 'open'; part: 'overlay' | 'panel' | 'tray' }
	| {
			action: 'pause';
			origin: PressOrigin;
			trackId: string;
	  }
	| {
			action: 'pick' | 'remove';
			origin: 'tray';
			trackId: string;
	  }
	| {
			action: 'play';
			// False when the play loads the track, as after a reload, an end or a failure
			isResume: boolean;
			origin: PressOrigin;
			trackId: string;
	  }
	| { action: 'play-track' | 'queue-track'; origin: 'page'; trackId: string }
	| { action: 'play-tracks'; origin: 'page'; trackId: string; trackIds: Array<string> }
	| { action: 'queue-tracks'; origin: 'page'; trackIds: Array<string> };

// Read after the step lands, so a press carries the track it reached
export function stepPress(
	state: PlayerStore,
	action: 'next' | 'previous',
	origin: StepOrigin,
): PlayerPress | undefined {
	const track = displayedTrack(state);
	if (!track) return undefined;

	return { action, origin, trackId: track.trackId };
}

// Read before the toggle lands, since the press is named by the state it found
export function togglePress(state: PlayerStore, origin: PressOrigin): PlayerPress | undefined {
	return transportPress(state, state.isPaused ? 'play' : 'pause', origin);
}

export function transportPress(
	state: PlayerStore,
	action: 'pause' | 'play',
	origin: PressOrigin,
): PlayerPress | undefined {
	const track = displayedTrack(state);
	if (!track) return undefined;
	if (action === 'pause') return { action, origin, trackId: track.trackId };

	return { action, isResume: state.hasPlayed(track.queueId), origin, trackId: track.trackId };
}
