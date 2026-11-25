import { fc, test } from '@fast-check/vitest';
import { describe, expect, vi } from 'vitest';

import type { QueueState } from '#queue/queue-state.ts';
import type { QueuedTrack, Track } from '#types.ts';

import {
	createQueueIds,
	loadedQueue,
	movedTrack,
	playedTrack,
	queuedTracks,
	refreshedQueue,
	removedAt,
	shuffledQueue,
	stampQueue,
	startedQueue,
} from '#queue/queue-state.ts';

function makeTrack(trackId: string): Track {
	return {
		artistLine: 'Nebula Drift',
		releaseTitle: 'Cosmic Drift',
		title: `Track ${trackId}`,
		trackId,
	};
}

const release = [makeTrack('a'), makeTrack('b'), makeTrack('c')];

const nextId = createQueueIds();

function emptyState(): QueueState {
	return { currentIndex: undefined, isShuffling: false, playOrder: [], queue: [] };
}

function orderViolation(state: QueueState): string | undefined {
	const { currentIndex, isShuffling, playOrder, queue } = state;
	const isInRange = (index: number) => index >= 0 && index < queue.length;

	if (playOrder.length !== queue.length || new Set(playOrder).size !== queue.length) {
		return 'play order is not one entry per queue position';
	}
	if (playOrder.some((index) => !isInRange(index))) return 'play order points outside the queue';
	if (!isShuffling && playOrder.some((index, position) => index !== position)) {
		return 'an unshuffled play order is out of queue order';
	}
	if (currentIndex !== undefined && !isInRange(currentIndex)) {
		return 'loaded index is outside the queue';
	}

	return undefined;
}

// Stands in for `Math.random`, so fast-check can replay and shrink a failing shuffle
function seededRandom(seed: number): () => number {
	let state = seed;

	return () => {
		state = (state * 16_807) % 2_147_483_647;

		return state / 2_147_483_647;
	};
}

function stamp(tracks: ReadonlyArray<Track>): Array<QueuedTrack> {
	return stampQueue(tracks, nextId);
}

function stampOne(trackId: string): QueuedTrack {
	return { ...makeTrack(trackId), queueId: nextId() };
}

function queueTrackIds(queue: ReadonlyArray<QueuedTrack>): Array<string> {
	return queue.map((track) => track.trackId);
}

function withQueue(tracks: ReadonlyArray<Track>, currentIndex: number | undefined): QueueState {
	const loaded = loadedQueue(emptyState(), stamp(tracks));

	return { ...loaded, currentIndex };
}

describe('loadedQueue', () => {
	test('replaces the queue and loads nothing out of it', () => {
		const state = loadedQueue(withQueue(release, 1), stamp([makeTrack('x'), makeTrack('y')]));

		expect(queueTrackIds(state.queue)).toStrictEqual(['x', 'y']);
		expect(state.playOrder).toStrictEqual([0, 1]);
		expect(state.currentIndex).toBeUndefined();
	});
});

describe('startedQueue', () => {
	test('loads the head when no track is named', () => {
		const started = startedQueue(stamp(release), undefined, false);

		expect(started?.loadIndex).toBe(0);
		expect(started?.state.currentIndex).toBeUndefined();
		expect(queueTrackIds(started?.state.queue ?? [])).toStrictEqual(['a', 'b', 'c']);
	});

	test('refuses an empty list and a named track the list does not carry', () => {
		expect(startedQueue([], undefined, false)).toBeUndefined();
		expect(startedQueue(stamp(release), 'z', false)).toBeUndefined();
	});

	test('puts the named track first in a shuffled order', () => {
		const started = startedQueue(stamp(release), 'c', true);

		expect(started?.loadIndex).toBe(2);
		expect(started?.state.playOrder[0]).toBe(2);
	});
});

describe('playedTrack', () => {
	test('jumps to a track already queued rather than appending a second copy', () => {
		const running = withQueue(release, 0);
		const played = playedTrack(running, stampOne('c'));

		expect(played.loadIndex).toBe(2);
		expect(played.state).toStrictEqual(running);
	});

	test('appends a track not yet queued, leaving the loaded index to the caller', () => {
		const played = playedTrack(withQueue(release, 1), stampOne('d'));

		expect(queueTrackIds(played.state.queue)).toStrictEqual(['a', 'b', 'c', 'd']);
		expect(played.state.currentIndex).toBe(1);
		expect(played.loadIndex).toBe(3);
	});

	test('puts an appended track at the end of a shuffled order', () => {
		const shuffling = { ...withQueue(release, 2), isShuffling: true, playOrder: [2, 0, 1] };

		expect(playedTrack(shuffling, stampOne('e')).state.playOrder).toStrictEqual([2, 0, 1, 3]);
	});

	test('onto an empty queue, queues only that track', () => {
		const played = playedTrack(emptyState(), stampOne('b'));

		expect(played.loadIndex).toBe(0);
		expect(queueTrackIds(played.state.queue)).toStrictEqual(['b']);
		expect(played.state.playOrder).toStrictEqual([0]);
	});
});

describe('refreshedQueue', () => {
	test('gives a stored track from an older build the page fields, keeping its queue id and place', () => {
		const legacy = { ...makeTrack('b'), artworkUrl: '/b-512.webp' };
		const queue = stamp([makeTrack('a'), legacy, makeTrack('c')]);
		const fresh = { ...makeTrack('b'), artwork: [{ src: '/b-120.webp', width: 120 }] };

		const refreshed = refreshedQueue(queue, [fresh]);

		expect(refreshed?.[1]).toStrictEqual({ ...fresh, queueId: queue[1]?.queueId });
		expect(refreshed?.[0]).toBe(queue[0]);
		expect(refreshed?.[2]).toBe(queue[2]);
	});

	test('answers nothing when the page carries the same fields in another key order', () => {
		const queue = stamp([
			{ ...makeTrack('a'), artwork: [{ src: 'a.jpg', type: 'image/jpeg', width: 120 }] },
		]);
		const fresh = Object.assign(
			{ title: 'Track a' },
			{
				...makeTrack('a'),
				artwork: [Object.assign({ width: 120 }, { src: 'a.jpg', type: 'image/jpeg' })],
			},
		);

		expect(refreshedQueue(queue, [fresh])).toBeUndefined();
	});

	test('answers nothing when the page carries a key holding undefined that storage dropped', () => {
		const fresh = makeTrack('a');

		Reflect.set(fresh, 'releaseHref', undefined);

		expect(refreshedQueue(stamp([makeTrack('a')]), [fresh])).toBeUndefined();
	});

	test('refreshes a track whose nested field changed', () => {
		const queue = stamp([
			{ ...makeTrack('a'), artwork: [{ src: 'a.jpg', type: 'image/jpeg', width: 120 }] },
		]);
		const fresh = {
			...makeTrack('a'),
			artwork: [{ src: 'a.jpg', type: 'image/jpeg', width: 240 }],
		};

		expect(refreshedQueue(queue, [fresh])?.[0]).toStrictEqual({
			...fresh,
			queueId: queue[0]?.queueId,
		});
	});

	test('refreshes a track that gained or lost a field', () => {
		const queue = stamp([{ ...makeTrack('a'), durationMs: 12 }]);

		expect(refreshedQueue(queue, [makeTrack('a')])).toBeDefined();
		expect(
			refreshedQueue(stamp([makeTrack('a')]), [{ ...makeTrack('a'), durationMs: 12 }]),
		).toBeDefined();
	});

	test('answers nothing when the page carries none of the queued tracks', () => {
		expect(refreshedQueue(stamp(release), [makeTrack('z')])).toBeUndefined();
	});
});

describe('removedAt', () => {
	test('leaves nothing loaded when the loaded track goes', () => {
		const state = removedAt(withQueue(release, 1), 1);

		expect(queueTrackIds(state.queue)).toStrictEqual(['a', 'c']);
		expect(state.currentIndex).toBeUndefined();
	});

	test('shifts the loaded track down when an earlier one goes', () => {
		expect(removedAt(withQueue(release, 2), 0).currentIndex).toBe(1);
	});

	test('leaves the loaded track where it is when a later one goes', () => {
		expect(removedAt(withQueue(release, 0), 2).currentIndex).toBe(0);
	});

	test('remaps a shuffled order rather than reshuffling it', () => {
		const shuffling = { ...withQueue(release, 0), isShuffling: true, playOrder: [0, 2, 1] };
		const state = removedAt(shuffling, 0);

		expect(state.playOrder).toStrictEqual([1, 0]);
	});
});

describe('movedTrack', () => {
	test('moves the row and follows the loaded track', () => {
		const state = movedTrack(withQueue(release, 0), 0, 2);

		expect(queueTrackIds(state.queue)).toStrictEqual(['b', 'c', 'a']);
		expect(state.currentIndex).toBe(2);
	});

	test('remaps a shuffled order rather than reshuffling it', () => {
		const shuffling = { ...withQueue(release, 0), isShuffling: true, playOrder: [0, 2, 1] };
		const state = movedTrack(shuffling, 0, 2);

		expect(state.playOrder).toStrictEqual([2, 1, 0]);
	});
});

describe('shuffledQueue', () => {
	test('restores the natural order when toggled off', () => {
		const shuffling = { ...withQueue(release, 1), isShuffling: true, playOrder: [1, 2, 0] };

		expect(shuffledQueue(shuffling, false).playOrder).toStrictEqual([0, 1, 2]);
	});

	test('puts the loaded track first when toggled on', () => {
		expect(shuffledQueue(withQueue(release, 1), true).playOrder[0]).toBe(1);
	});
});

interface QueueStep {
	from: number;
	isLoaded: boolean;
	kind: 'clear' | 'jump' | 'load' | 'move' | 'play' | 'queue' | 'remove' | 'shuffle' | 'start';
	releaseSize: number;
	to: number;
	trackPick: number | undefined;
}

// Only five track ids, so the same track often gets queued twice under different queue ids
const releaseIds = ['a', 'b', 'c', 'd', 'e'];

const queueSteps = fc.array(
	fc.record({
		from: fc.nat(),
		isLoaded: fc.boolean(),
		kind: fc.constantFrom(
			'clear',
			'jump',
			'load',
			'move',
			'play',
			'queue',
			'remove',
			'shuffle',
			'start',
		),
		releaseSize: fc.integer({ max: 4, min: 1 }),
		to: fc.nat(),
		trackPick: fc.option(fc.integer({ max: releaseIds.length, min: 0 }), { nil: undefined }),
	}),
	{ maxLength: 16, size: 'max' },
);

const loadKeepingSteps: ReadonlySet<QueueStep['kind']> = new Set(['move', 'remove', 'shuffle']);

const orderKeepingSteps: ReadonlySet<QueueStep['kind']> = new Set([
	'move',
	'play',
	'queue',
	'remove',
]);

function loadedQueueId(state: QueueState): string | undefined {
	return state.currentIndex === undefined ? undefined : state.queue[state.currentIndex]?.queueId;
}

function playOrderIds(state: QueueState): Array<string | undefined> {
	return state.playOrder.map((index) => state.queue[index]?.queueId);
}

function stampedRelease(step: QueueStep): Array<QueuedTrack> {
	return stamp(releaseIds.slice(0, step.releaseSize).map(makeTrack));
}

function pickedId(step: QueueStep): string | undefined {
	return step.trackPick === undefined ? undefined : (releaseIds[step.trackPick] ?? 'missing');
}

function loadedAt(
	played: undefined | { loadIndex: number; state: QueueState },
	state: QueueState,
	step: QueueStep,
): QueueState {
	if (!played) return state;
	if (!step.isLoaded) return played.state;

	return { ...played.state, currentIndex: played.loadIndex };
}

const queueStepActions: Record<
	QueueStep['kind'],
	(state: QueueState, step: QueueStep) => QueueState
> = {
	clear: (state) => ({ ...emptyState(), isShuffling: state.isShuffling }),
	jump: (state, step) =>
		state.queue.length === 0 ? state : { ...state, currentIndex: step.from % state.queue.length },
	load: (state, step) => loadedQueue(state, stampedRelease(step)),
	move: (state, step) => {
		const length = Math.max(1, state.queue.length);
		const from = step.from % length;
		const to = step.to % length;

		return from === to ? state : movedTrack(state, from, to);
	},
	play: (state, step) => loadedAt(playedTrack(state, stampOne(pickedId(step) ?? 'a')), state, step),
	queue: (state, step) => queuedTracks(state, stampedRelease(step)) ?? state,
	remove: (state, step) =>
		state.queue.length === 0 ? state : removedAt(state, step.from % state.queue.length),
	shuffle: (state) => shuffledQueue(state, !state.isShuffling),
	start: (state, step) =>
		loadedAt(startedQueue(stampedRelease(step), pickedId(step), state.isShuffling), state, step),
};

function queueIdChanges(before: QueueState, after: QueueState) {
	const afterIds = new Set(after.queue.map((track) => track.queueId));
	const beforeIds = new Set(before.queue.map((track) => track.queueId));

	return {
		added: after.queue
			.filter((track) => !beforeIds.has(track.queueId))
			.map((track) => track.queueId),
		removed: new Set(
			before.queue.filter((track) => !afterIds.has(track.queueId)).map((track) => track.queueId),
		),
	};
}

function expectLoadedTrackKept(before: QueueState, after: QueueState, step: QueueStep): void {
	const isKeeping =
		loadKeepingSteps.has(step.kind) ||
		step.kind === 'queue' ||
		(step.kind === 'play' && !step.isLoaded);
	if (!isKeeping) return;

	const loadedBefore = loadedQueueId(before);
	const { removed } = queueIdChanges(before, after);

	expect(loadedQueueId(after)).toBe(
		loadedBefore !== undefined && removed.has(loadedBefore) ? undefined : loadedBefore,
	);
}

// Filling an empty queue while shuffling reshuffles it around the first track, so this only holds once the queue has tracks
function expectRunningOrderKept(before: QueueState, after: QueueState, step: QueueStep): void {
	if (!before.isShuffling || before.queue.length === 0 || !orderKeepingSteps.has(step.kind)) return;

	const { added, removed } = queueIdChanges(before, after);

	expect(playOrderIds(after)).toStrictEqual([
		...playOrderIds(before).filter((queueId) => queueId === undefined || !removed.has(queueId)),
		...added,
	]);
}

describe('queue transitions', () => {
	// The persisted reader drops a shuffled order that is not a permutation, so a violation silently reshuffles on reload
	test.prop([queueSteps, fc.integer({ max: 2_147_483_646, min: 1 })])(
		'keep one play order entry per row, the loaded track loaded, and what is left to play in its order',
		(steps, seed) => {
			vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));

			try {
				let state = emptyState();

				for (const step of steps) {
					const next = queueStepActions[step.kind](state, step);

					expect(orderViolation(next), JSON.stringify(next)).toBeUndefined();
					expectLoadedTrackKept(state, next, step);
					expectRunningOrderKept(state, next, step);

					state = next;
				}
			} finally {
				vi.restoreAllMocks();
			}
		},
	);
});
