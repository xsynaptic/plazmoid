import { getByRole } from '@testing-library/dom';
import { createMemoryStorage, createPlayerStore } from '@xsynaptic/plazmoid-core';
import { afterEach, describe, expect, test } from 'vitest';

import { createPlayer } from '#elements/create-player.ts';
import { defaultLabels } from '#labels.ts';
import { createViewStore } from '#view/view-store.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('createPlayer', () => {
	test('lands the options before the bar is shaped', () => {
		const store = createPlayerStore({ storage: createMemoryStorage() });
		const view = createViewStore({ storage: createMemoryStorage() });
		const root = createPlayer({
			isArtworkEnabled: false,
			isOverlayEnabled: false,
			isPanelEnabled: false,
			isScopeEnabled: true,
			labels: { ...defaultLabels, seekBack: 'Back {seconds}' },
			store,
			view,
		});

		document.body.append(root);

		getByRole(root, 'button', { name: 'Back 10' });
		expect(root.querySelector('pzm-artwork')).toBeNull();
		expect(root.querySelector('pzm-overlay-toggle')).toBeNull();
		expect(root.querySelector('pzm-panel-toggle')).toBeNull();
		expect(root.querySelector('pzm-scope')).not.toBeNull();
	});
});
