import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { defaultLabels } from '#labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-play-button>', () => {
	test('follows intent and marks the cap alone while a load heads for playback', () => {
		const { fake, part, store } = mount('pzm-play-button');

		store.getState().playQueue([sampleTrack('a')], 'a');

		const marked = () => [...part.querySelectorAll('[data-pzm-essential-motion]')];

		expect(getByRole(part, 'button', { name: defaultLabels.pause }).hasAttribute('disabled')).toBe(
			false,
		);
		expect(marked()).toHaveLength(1);
		expect(marked()[0]?.matches('sonic-button > .sonic-button > .sonic-button-cap')).toBe(true);

		store.getState().pause();

		expect(getByRole(part, 'button', { name: defaultLabels.play })).toBeDefined();
		expect(marked()).toStrictEqual([]);

		fake.callbacks.current?.onStatus('loading');

		expect(marked()).toStrictEqual([]);
	});

	test('reports play and pause, resuming only an entry that has played since it loaded', () => {
		const onPress = vi.fn();
		const { fake, part, store } = mount('pzm-play-button', { root: { onPress } });
		const button = () => part.querySelector('button');

		store.getState().loadQueue([sampleTrack('a')]);
		button()?.click();
		fake.callbacks.current?.onStatus('playing');
		button()?.click();
		button()?.click();
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onEnded();
		button()?.click();

		expect(onPress.mock.calls.map(([press]: Array<unknown>) => press)).toStrictEqual([
			{ action: 'play', isResume: false, origin: 'bar', trackId: 'a' },
			{ action: 'pause', origin: 'bar', trackId: 'a' },
			{ action: 'play', isResume: true, origin: 'bar', trackId: 'a' },
			{ action: 'play', isResume: false, origin: 'bar', trackId: 'a' },
		]);
	});

	// Safari has no `moveBefore`, so the router's move arrives as a disconnect and a connect
	test('binds once after a disconnect and a connect', async () => {
		const { fake, part, root, store } = mount('pzm-play-button');

		store.getState().playQueue([sampleTrack('a')], 'a');
		fake.callbacks.current?.onStatus('playing');
		root.remove();
		document.body.append(root);
		await Promise.resolve();
		getByRole(part, 'button', { name: defaultLabels.pause }).click();

		expect(store.getState().isPaused).toBe(true);
		expect(part.querySelectorAll('button')).toHaveLength(1);
	});
});
