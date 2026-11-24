import type { StoreApi } from 'zustand/vanilla';

import type { QueueState } from '#queue/queue-state.ts';
import type { PlaybackController } from '#store/playback-controller.ts';
import type { PlayerPersistence } from '#store/player-persistence.ts';
import type { PlayerActions, PlayerStore } from '#store/player-types.ts';
import type { Track } from '#types.ts';

import {
	appendedQueue,
	createQueueIds,
	loadedQueue,
	movedTrack,
	queuedTracks,
	refreshedQueue,
	removedAt,
	shuffledQueue,
	stampQueue,
} from '#queue/queue-state.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { canMove } from '#queue/reorder.ts';

type QueueActions = Pick<
	PlayerActions,
	| 'clearQueue'
	| 'loadQueue'
	| 'moveTrack'
	| 'playQueue'
	| 'playTrack'
	| 'queueTrack'
	| 'queueTracks'
	| 'refreshQueue'
	| 'removeAt'
	| 'toggleShuffle'
>;

export function createQueueActions({
	api,
	persistence,
	playback,
}: {
	api: StoreApi<PlayerStore>;
	persistence: PlayerPersistence;
	playback: PlaybackController;
}): QueueActions & { hydrateQueue: () => void } {
	const { getState: get, setState: set } = api;

	const nextQueueId = createQueueIds();

	function queueState(): QueueState {
		const { currentIndex, isShuffling, playOrder, queue } = get();

		return { currentIndex, isShuffling, playOrder, queue };
	}

	function stamped(tracks: ReadonlyArray<Track>) {
		return stampQueue(tracks, nextQueueId);
	}

	function enqueue(tracks: ReadonlyArray<Track>, trackId?: string): void {
		const appended = appendedQueue(queueState(), stamped(tracks), trackId);
		if (!appended) return;

		set(appended.state);
		get().playAt(appended.loadIndex);
	}

	return {
		clearQueue: () => {
			playback.unload();
			set({ currentIndex: undefined, durationSeconds: undefined, playOrder: [], queue: [] });
		},

		// Positioned, with nothing loaded and nothing playing
		hydrateQueue: () => {
			const stored = persistence.readQueue();
			if (!stored) return;

			const restored = {
				...loadedQueue(queueState(), stamped(stored.queue)),
				currentIndex: stored.currentIndex,
			};
			const track =
				stored.currentIndex === undefined ? undefined : stored.queue[stored.currentIndex];

			set({
				...(stored.playOrder === undefined
					? shuffledQueue(restored, stored.isShuffling)
					: { ...restored, isShuffling: true, playOrder: stored.playOrder }),
				currentTimeSeconds: stored.currentTimeSeconds,
				details: persistence.readDetails(),
				durationSeconds: toDurationSeconds(track),
				status: 'idle',
			});
		},

		loadQueue: (tracks) => {
			if (tracks.length === 0) return;

			playback.unload();
			set({ ...loadedQueue(queueState(), stamped(tracks)), durationSeconds: undefined });
		},

		moveTrack: (from, to) => {
			const state = queueState();
			if (!canMove(state.queue.length, from, to)) return;

			set(movedTrack(state, from, to));
		},

		playQueue: (tracks, startTrackId) => {
			if (tracks.length === 0) return;
			if (startTrackId !== undefined && tracks.every((track) => track.trackId !== startTrackId)) {
				return;
			}

			get().clearQueue();
			enqueue(tracks, startTrackId);
		},

		playTrack: (releaseTracks, trackId) => {
			enqueue(releaseTracks, trackId);
		},

		queueTrack: (releaseTracks, trackId) => {
			const track = releaseTracks.find((releaseTrack) => releaseTrack.trackId === trackId);
			if (!track) return;

			get().queueTracks([track]);
		},

		queueTracks: (tracks) => {
			const queued = queuedTracks(queueState(), stamped(tracks));

			if (queued) set(queued);
		},

		refreshQueue: (tracks) => {
			const queue = refreshedQueue(get().queue, tracks);

			if (queue) set({ queue });
		},

		removeAt: (index) => {
			const state = queueState();
			if (index < 0 || index >= state.queue.length) return;

			if (index === state.currentIndex) {
				playback.unload();
				set({ ...removedAt(state, index), durationSeconds: undefined });
				return;
			}

			set(removedAt(state, index));
		},

		toggleShuffle: () => {
			const state = queueState();

			set(shuffledQueue(state, !state.isShuffling));
		},
	};
}
