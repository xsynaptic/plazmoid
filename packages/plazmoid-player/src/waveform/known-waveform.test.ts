import { formatVersion } from '@xsynaptic/plazmoid-wavedata';
import { describe, expect, test } from 'vitest';

import { sampleWaveform } from '#test/wavedata.ts';
import { knownWaveform } from '#waveform/known-waveform.ts';

const waveform = sampleWaveform('known');

describe('knownWaveform', () => {
	test("passes a descriptor of the package's own format version through", () => {
		expect(knownWaveform({ waveform })).toBe(waveform);
	});

	test('withholds a descriptor from a newer writer, overview and all', () => {
		expect(
			knownWaveform({ waveform: { ...waveform, formatVersion: formatVersion + 1 } }),
		).toBeUndefined();
	});
});
