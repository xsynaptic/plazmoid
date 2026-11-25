import { expect, test } from 'vitest';

import { createWavedataWriter, headerBytes, validateWavedata } from '#index.ts';
import { stereoInput, toBytes, toHex } from '#test/golden.ts';

const sampleRate = 44_100;

function repeat(frames: number, frame: [left: number, right: number]) {
	return Array.from({ length: frames }, () => frame);
}

function write(mode: 'average' | 'overall', frames: Array<[left: number, right: number]>) {
	const writer = createWavedataWriter({ hasBands: false, mode, sampleRate });

	writer.push(stereoInput(frames));

	const { facts, file } = writer.finish();

	return { facts, file };
}

function decodeOverview(overview: string): Array<number> {
	return Array.from(atob(overview), (character) => character.codePointAt(0) ?? 0);
}

test('identical channels write the same records in both modes', () => {
	const frames = Array.from({ length: 3000 }, (_, index): [number, number] => {
		const sample = ((index * 7919) % 65_536) - 32_768;

		return [sample, sample];
	});
	const average = write('average', frames);
	const overall = write('overall', frames);

	expect(toHex(overall.file.subarray(headerBytes))).toBe(toHex(average.file.subarray(headerBytes)));
	expect(overall.facts.overview).toBe(average.facts.overview);
});

test('a file without bands has 12-byte records and no band facts', () => {
	const { facts, file } = write('overall', repeat(1025, [16_384, -16_384]));

	expect(file).toHaveLength(32 + 2 * 12);
	expect(facts.bands).toBeUndefined();
	expect(validateWavedata(file)).toStrictEqual([]);
});

test('an overview bucket is the level of its samples, not the mean of its pair levels', () => {
	const frames = Array.from({ length: 800 }, (_, pair) =>
		repeat(256, pair % 2 === 0 ? [16_384, 16_384] : [0, 0]),
	).flat();
	const levels = decodeOverview(write('average', frames).facts.overview);

	// Half the samples at half scale is a mean square of 0.125, -9.03 dB
	expect(levels).toHaveLength(400);
	expect(new Set(levels)).toStrictEqual(new Set([217]));
});

test('a short last pair weighs its bucket by the samples it has', () => {
	const frames = [...repeat(400 * 256, [0, 0]), ...repeat(64, [16_384, 16_384])];
	const levels = decodeOverview(write('average', frames).facts.overview);

	// 401 pairs in 400 buckets: the last holds 256 silent samples and 64 at half scale, -13.01 dB
	expect(levels.at(-1)).toBe(200);
});

test('a source that is not 16-bit is refused', () => {
	const writer = createWavedataWriter({ hasBands: false, mode: 'overall', sampleRate });

	expect(() => {
		writer.push(toBytes([0.5, 0.3]));
	}).toThrow('not 16-bit PCM');
});

test('a float at full scale is refused, since no 16-bit sample decodes to it', () => {
	const writer = createWavedataWriter({ hasBands: false, mode: 'overall', sampleRate });

	expect(() => {
		writer.push(toBytes([1, 0]));
	}).toThrow('not 16-bit PCM');
});

test('input that ends inside a frame is refused', () => {
	const writer = createWavedataWriter({ hasBands: false, mode: 'overall', sampleRate });

	writer.push(toBytes([0.5, 0.5, 0.5]));

	expect(() => writer.finish()).toThrow('inside a frame');
});

test('input with no samples is refused', () => {
	const writer = createWavedataWriter({ hasBands: false, mode: 'overall', sampleRate });

	expect(() => writer.finish()).toThrow('no samples');
});
