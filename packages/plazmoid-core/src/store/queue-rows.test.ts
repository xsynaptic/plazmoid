import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PlayerUrls, Track } from '#types.ts';

import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { makeTrack } from '#test/player-store.ts';

function titled(trackId: string, title: string): Track {
	return { ...makeTrack(trackId), title };
}

function restore(resolveRows: PlayerUrls['tracks']) {
	const store = createWritablePlayerStore({ createEngine: createMockEngine().createEngine });

	store.getState().configure({
		urls: {
			stream: () => Promise.resolve({ sources: [{ url: 'https://api.test/a' }], status: 'ok' }),
			...(resolveRows ? { tracks: resolveRows } : {}),
		},
	});

	return store;
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	localStorage.clear();
});

describe('stored rows', () => {
	test("a restored queue asks for its window's rows once, then each track as it enters the window", async () => {
		const first = createWritablePlayerStore({ createEngine: createMockEngine().createEngine });

		first.getState().loadQueue(['a', 'b', 'c'].map((trackId) => titled(trackId, 'Old')));

		const resolveRows = vi.fn((trackIds: ReadonlyArray<string>) =>
			Promise.resolve(trackIds.map((trackId) => titled(trackId, 'New'))),
		);
		const second = restore(resolveRows);

		await settle();

		expect(second.getState().queue.map((track) => track.title)).toStrictEqual([
			'New',
			'New',
			'Old',
		]);

		second.getState().playAt(1);
		second.getState().playAt(0);
		await settle();

		expect(resolveRows.mock.calls).toStrictEqual([[['a', 'b']], [['c']]]);
		expect(second.getState().queue.map((track) => track.title)).toStrictEqual([
			'New',
			'New',
			'New',
		]);
	});

	test('a host that fails keeps the stored rows, and is not asked again for them', async () => {
		const first = createWritablePlayerStore({ createEngine: createMockEngine().createEngine });

		first.getState().loadQueue([titled('a', 'Old')]);

		const resolveRows = vi.fn(() => Promise.reject(new Error('offline')));
		const second = restore(resolveRows);

		await settle();
		second.getState().playAt(0);
		await settle();

		expect(second.getState().queue[0]?.title).toBe('Old');
		expect(resolveRows).toHaveBeenCalledOnce();
	});

	test('a queue made in this document is never asked for', async () => {
		const resolveRows = vi.fn(() => Promise.resolve([]));
		const store = restore(resolveRows);

		store.getState().loadQueue([makeTrack('a'), makeTrack('b')]);
		await settle();

		expect(resolveRows).not.toHaveBeenCalled();
	});
});
