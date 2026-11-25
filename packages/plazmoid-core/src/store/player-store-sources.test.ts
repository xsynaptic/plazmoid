import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamSource } from '#types.ts';

import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { fake, makeTrack, resetEngine } from '#test/player-store.ts';

const opus = 'audio/mp4; codecs="Opus"';

function withSources(sources?: ReadonlyArray<StreamSource>) {
	const store = createWritablePlayerStore({
		createEngine: fake.createEngine,
		storage: createMemoryStorage(),
	});

	store.getState().configure({ urls: {} });
	store.getState().playQueue([{ ...makeTrack('a'), ...(sources ? { sources } : {}) }]);

	return store;
}

beforeEach(resetEngine);

describe('a track that carries its sources', () => {
	test('loads the first source the probe accepts, in the order the track lists them', async () => {
		fake.engine.canPlay.mockImplementation((type) => type !== opus);

		withSources([
			{ type: opus, url: 'https://cdn.test/a.mp4' },
			{ type: 'audio/mpeg', url: 'https://cdn.test/a.mp3' },
			{ url: 'https://cdn.test/a.ogg' },
		]);

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				resumeAtSeconds: 0,
				src: 'https://cdn.test/a.mp3',
			});
		});
	});

	test('a track with no sources ends in error at the resolve stage, without loading', async () => {
		const store = withSources();

		await vi.waitFor(() => {
			expect(store.getState().status).toBe('error');
		});

		expect(fake.engine.load).not.toHaveBeenCalled();
		expect(store.getState().playbackError).toStrictEqual({ stage: 'resolve', trackId: 'a' });
	});

	test('a stream resolver, when given, decides over the track', async () => {
		const store = createWritablePlayerStore({
			createEngine: fake.createEngine,
			storage: createMemoryStorage(),
		});

		store.getState().configure({
			urls: {
				stream: () =>
					Promise.resolve({ sources: [{ url: 'https://api.test/signed' }], status: 'ok' }),
			},
		});
		store.getState().playQueue([{ ...makeTrack('a'), sources: [{ url: 'https://cdn.test/a' }] }]);

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				resumeAtSeconds: 0,
				src: 'https://api.test/signed',
			});
		});
	});
});
