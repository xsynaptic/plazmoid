import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlaybackEvent } from '#store/playback-events.ts';

import { bindPlaybackEvents } from '#store/playback-events.ts';
import { configured, fake, release, resetEngine, withResolver } from '#test/player-store.ts';

const mediaSnapshot = { networkState: 2, positionSeconds: 0, readyState: 0 };

function collect(store: ReturnType<typeof configured>): Array<PlaybackEvent> {
	const events: Array<PlaybackEvent> = [];

	bindPlaybackEvents(store, (event) => {
		events.push(event);
	});

	return events;
}

beforeEach(resetEngine);

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('bindPlaybackEvents', () => {
	test('sends one event per diagnostic, and none for the writes between them', () => {
		const store = configured();
		const events = collect(store);

		store.getState().playQueue(release, 'a');
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			kind: 'media-error',
			message: 'gone',
		});
		fake.callbacks.current?.onTime(12);
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			kind: 'media-error',
			message: 'gone',
		});

		expect(events.map((event) => event.kind)).toStrictEqual(['diagnostic', 'diagnostic']);
	});

	test('sends a failure once on entering a terminal status, and again only after leaving it', async () => {
		const store = configured();
		const events = collect(store);

		store.getState().playQueue(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		fake.callbacks.current?.onError('network');
		store.getState().seek(30);

		expect(events).toStrictEqual([
			{ error: { stage: 'network', trackId: 'a' }, kind: 'failed', status: 'error', trackId: 'a' },
		]);

		store.getState().togglePaused();
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(3);
		});
		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(4);
		});
		fake.callbacks.current?.onError('network');

		expect(events.filter((event) => event.kind === 'failed')).toHaveLength(2);
	});

	test('a capped resolve fails with no error, since nothing failed to load', async () => {
		const store = withResolver(() => Promise.resolve({ status: 'capped' }));
		const events = collect(store);

		store.getState().playQueue(release, 'b');
		await vi.waitFor(() => {
			expect(events).toStrictEqual([
				{ error: undefined, kind: 'failed', status: 'capped', trackId: 'b' },
			]);
		});
	});

	test('a listener that throws is reported, and the next event still reaches it', () => {
		const reportError = vi.fn();
		const failure = new Error('Analytics failed');
		const store = configured();
		const listener = vi.fn(() => {
			throw failure;
		});

		vi.stubGlobal('reportError', reportError);
		bindPlaybackEvents(store, listener);
		store.getState().playQueue(release, 'a');
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			kind: 'media-error',
			message: 'gone',
		});
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			kind: 'media-error',
			message: 'gone',
		});

		expect(listener).toHaveBeenCalledTimes(2);
		expect(reportError).toHaveBeenCalledWith(failure);
		expect(store.getState().diagnostic?.kind).toBe('media-error');
	});
});
