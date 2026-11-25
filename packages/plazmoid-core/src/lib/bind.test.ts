import { afterEach, expect, test, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { bind } from '#lib/bind.ts';

afterEach(() => {
	vi.unstubAllGlobals();
});

test('a write that throws is reported and leaves later subscribers their update', () => {
	const failure = new Error('showModal refused');
	const reportError = vi.fn();
	const store = createStore(() => ({ volume: 1 }));
	const later = vi.fn();

	vi.stubGlobal('reportError', reportError);
	bind(
		store,
		(state) => state.volume,
		(volume) => {
			if (volume < 1) throw failure;
		},
		new AbortController().signal,
	);
	store.subscribe(later);
	store.setState({ volume: 0.5 });

	expect(reportError).toHaveBeenCalledWith(failure);
	expect(later).toHaveBeenCalledOnce();
});
