import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { defaultLabels } from '#labels.ts';
import { mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-panel-toggle>', () => {
	test('reports opening the panel, and not closing it', () => {
		const onPress = vi.fn();
		const { part, store, view } = mount('pzm-panel-toggle', { root: { onPress } });

		store.getState().playQueue([sampleTrack('a')], 'a');

		const toggle = getByRole(part, 'button', { name: defaultLabels.waveformPanel });

		toggle.click();
		toggle.click();

		expect(view.getState().isPanelOpen).toBe(false);
		expect(onPress).toHaveBeenCalledExactlyOnceWith({ action: 'open', part: 'panel' });
	});
});
