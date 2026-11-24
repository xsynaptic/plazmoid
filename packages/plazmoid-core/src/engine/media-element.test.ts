import { beforeEach, describe, expect, test, vi } from 'vitest';

import { whenMediaElement } from '#engine/media-element.ts';
import { configured, fake, release, resetEngine } from '#test/player-store.ts';

beforeEach(() => {
	resetEngine();
});

describe('whenMediaElement', () => {
	test('waits through earlier states for the first load, then stops listening', async () => {
		const store = configured();
		const subscribe = store.subscribe.bind(store);
		const unsubscribed = vi.fn();

		vi.spyOn(store, 'subscribe').mockImplementation((listener) => {
			const unsubscribe = subscribe(listener);

			return () => {
				unsubscribed();
				unsubscribe();
			};
		});

		const element = whenMediaElement(store);

		store.getState().setVolume(0.5);

		expect(unsubscribed).not.toHaveBeenCalled();

		store.getState().playQueue(release);

		await expect(element).resolves.toBe(fake.engine.element);
		expect(unsubscribed).toHaveBeenCalledOnce();
	});

	test('answers at once when the engine already exists', async () => {
		const store = configured();

		store.getState().playQueue(release);

		const subscribe = vi.spyOn(store, 'subscribe');

		await expect(whenMediaElement(store)).resolves.toBe(fake.engine.element);
		expect(subscribe).not.toHaveBeenCalled();
	});
});
