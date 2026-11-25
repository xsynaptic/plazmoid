import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamResolution } from '#types.ts';

import {
	configured,
	fake,
	makeTrack,
	release,
	resetEngine,
	withResolver,
} from '#test/player-store.ts';

beforeEach(resetEngine);

describe('playTrack', () => {
	test('jumps to a queued track by its id rather than queueing it twice', async () => {
		const store = configured();

		store.getState().loadQueue(release);
		store.getState().playTrack(makeTrack('b'));

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBe(1);
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/b/stream',
			});
		});
	});

	test('appends a track not yet queued and plays it, onto the end of a shuffled order', () => {
		const store = configured();

		store.getState().loadQueue(release);
		store.getState().toggleShuffle();

		const { playOrder } = store.getState();

		store.getState().playTrack(makeTrack('x'));

		expect(store.getState().queue.map((track) => track.trackId)).toStrictEqual([
			'a',
			'b',
			'c',
			'x',
		]);
		expect(store.getState().playOrder).toStrictEqual([...playOrder, 3]);
		expect(store.getState().currentIndex).toBe(3);
	});

	test('toggles transport when the track is already loaded', async () => {
		const store = configured();

		store.getState().playQueue(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		fake.callbacks.current?.onStatus('playing');
		store.getState().playTrack(makeTrack('a'));

		expect(store.getState()).toMatchObject({ currentIndex: 0, isPaused: true });
		expect(store.getState().queue).toHaveLength(3);
		expect(fake.engine.pause).toHaveBeenCalled();

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fake.engine.load).toHaveBeenCalledOnce();
	});
});

describe('playQueue', () => {
	test('replaces a running queue and plays the new one from the top', () => {
		const store = configured();

		store.getState().playQueue(release, 'b');
		store.getState().playQueue([makeTrack('x'), makeTrack('y')]);

		const state = store.getState();

		expect(state.queue.map((track) => track.trackId)).toStrictEqual(['x', 'y']);
		expect(state.currentIndex).toBe(0);
		expect(fake.engine.reset).toHaveBeenCalledOnce();
	});

	test.each([
		['the chosen track is not among the new ones', [makeTrack('x')], 'c'],
		['the new list is empty', [], undefined],
	])('leaves the running queue alone when %s', (_label, tracks, startTrackId) => {
		const store = configured();

		store.getState().playQueue(release, 'b');
		store.getState().playQueue(tracks, startTrackId);

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBe(1);
	});
});

describe('queueTracks', () => {
	test('appends every track not yet queued, in order, without loading', () => {
		const store = configured();

		store.getState().loadQueue([makeTrack('x'), makeTrack('b')]);
		store.getState().queueTracks(release);

		const state = store.getState();

		expect(state.queue.map((track) => track.trackId)).toStrictEqual(['x', 'b', 'a', 'c']);
		expect(state.currentIndex).toBeUndefined();
		expect(fake.engine.load).not.toHaveBeenCalled();
	});

	test('changes nothing when every track is already queued', () => {
		const store = configured();

		store.getState().queueTracks(release);

		const { queue } = store.getState();

		store.getState().queueTracks(release);

		expect(store.getState().queue).toBe(queue);
	});
});

describe('queue editing', () => {
	test('stops playback when the loaded track is removed', () => {
		const store = configured();

		store.getState().playQueue(release, 'b');
		store.getState().removeAt(1);

		const state = store.getState();

		expect(state.queue).toHaveLength(2);
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(fake.engine.reset).toHaveBeenCalled();
	});

	test('replacing the queue while playing unloads the engine and leaves it idle', () => {
		const store = configured();

		store.getState().playQueue(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		store.getState().loadQueue([makeTrack('x')]);

		expect(fake.engine.reset).toHaveBeenCalled();
		expect(store.getState()).toMatchObject({
			currentIndex: undefined,
			isPaused: true,
			status: 'idle',
		});
	});

	test('gives every enqueued track an id, including a second copy of the same track', () => {
		const store = configured();

		store.getState().loadQueue([...release, ...release]);

		const ids = store.getState().queue.map((track) => track.queueId);

		expect(ids).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
	});

	test('drops a resolve in flight when the loaded track is removed', async () => {
		const { promise, resolve } = Promise.withResolvers<StreamResolution>();
		const store = withResolver(() => promise);

		store.getState().playQueue(release, 'a');
		store.getState().removeAt(0);
		resolve({ sources: [{ url: 'https://api.test/tracks/a/stream' }], status: 'ok' });
		await Promise.resolve();

		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});
