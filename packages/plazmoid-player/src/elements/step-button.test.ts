import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { defaultLabels } from '#labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-step-button>', () => {
	test('keeps focus on next once its own press leaves nothing after the current track', () => {
		const onPress = vi.fn();
		const { part, store } = mount('pzm-step-button', {
			attributes: { direction: 'next' },
			root: { onPress },
		});

		store.getState().playQueue([sampleTrack('a'), sampleTrack('b')], 'a');

		const next = getByRole(part, 'button', { name: defaultLabels.next });

		next.focus();
		next.click();

		expect(store.getState().currentIndex).toBe(1);
		expect(next.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(next);

		next.click();

		expect(store.getState().currentIndex).toBe(1);
		expect(onPress).toHaveBeenCalledExactlyOnceWith({
			action: 'next',
			origin: 'bar',
			trackId: 'b',
		});
	});
});
