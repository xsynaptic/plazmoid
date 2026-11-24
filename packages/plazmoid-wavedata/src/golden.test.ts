import { expect, test } from 'vitest';

import {
	createWavedataWriter,
	describeWavedata,
	headerBytes,
	parseHeader,
	recordsByteRange,
	rmsRangeInSampleUnits,
	splitRecords,
	validateWavedata,
} from '#index.ts';
import { goldenInput, readGolden, toHex } from '#test/golden.ts';

const modes = ['average', 'overall'] as const;

const headerHex = {
	average: '505a57440200200044ac00000a0000000001040f01013c00c800d0072c090000',
	overall: '505a57440200200044ac00000a0000000001040f02013c00c800d0072c090000',
};

test.for(modes)(
	'the committed %s header is the bytes the written format lays out',
	async (mode) => {
		const { files } = await readGolden();

		expect(toHex(files[mode].subarray(0, headerBytes))).toBe(headerHex[mode]);
		expect(files[mode]).toHaveLength(77);
	},
);

test.for(modes)('the writer makes the committed %s file and facts', async (mode) => {
	const { files, golden } = await readGolden();
	const writer = createWavedataWriter({ hasBands: true, mode, sampleRate: golden.sampleRate });

	writer.push(goldenInput(golden, mode));

	const { facts, file } = writer.finish();

	expect(toHex(file)).toBe(toHex(files[mode]));
	expect(facts).toStrictEqual(golden[mode].facts);
});

test.for(modes)('a %s stream cut inside a float writes the same file', async (mode) => {
	const { files, golden } = await readGolden();
	const input = goldenInput(golden, mode);
	const writer = createWavedataWriter({ hasBands: true, mode, sampleRate: golden.sampleRate });
	const chunkBytes = 4099;

	for (let at = 0; at < input.length; at += chunkBytes) {
		writer.push(input.subarray(at, at + chunkBytes));
	}

	expect(toHex(writer.finish().file)).toBe(toHex(files[mode]));
});

test.for(modes)('the reader helpers read the committed %s file back', async (mode) => {
	const { files, golden } = await readGolden();
	const { facts, levels, pairs } = golden[mode];
	const range = recordsByteRange(facts, 0, 3);
	const target = {
		levels: new Uint8Array(9),
		rms: new Float32Array(10),
		samples: new Int8Array(20),
	};

	expect(parseHeader(files[mode])).toStrictEqual({
		hasBands: true,
		mode,
		pairCount: 10,
		sampleCount: golden.sampleCount,
		sampleRate: golden.sampleRate,
	});
	expect(range).toStrictEqual([32, 77]);

	splitRecords(files[mode].subarray(...(range ?? [0, 0])), target, { ...facts, fromRecord: 0 });

	expect([...target.samples]).toStrictEqual(pairs.flatMap(([min, max]) => [min, max]));
	expect([...target.levels]).toStrictEqual(levels.flat());
	// Level 229 is -6.12 dB, just under the 64 its peak stores
	expect(target.rms[0]).toBeCloseTo(128 * 10 ** (-6.118 / 20), 1);
	expect(target.rms[4]).toBe(mode === 'average' ? 0 : target.rms[0]);
});

test('a later chunk lands at its own records and leaves the rest alone', async () => {
	const { files, golden } = await readGolden();
	const range = recordsByteRange(golden.overall.facts, 1, 2);
	const target = {
		levels: new Uint8Array(9),
		rms: new Float32Array(10),
		samples: new Int8Array(20),
	};

	expect(range).toStrictEqual([47, 62]);

	splitRecords(files.overall.subarray(...(range ?? [0, 0])), target, {
		...golden.overall.facts,
		fromRecord: 1,
	});

	expect([...target.samples.subarray(0, 8)]).toStrictEqual([0, 0, 0, 0, 0, 0, 0, 0]);
	expect([...target.samples.subarray(8, 16)]).toStrictEqual([-64, 64, 0, 32, 0, 0, 127, 127]);
	expect([...target.levels]).toStrictEqual([0, 0, 0, 255, 1, 1, 0, 0, 0]);
});

test.for(modes)(
	'the committed %s file describes to its facts and validates clean',
	async (mode) => {
		const { files, golden } = await readGolden();
		const { overview: _overview, ...fileFacts } = golden[mode].facts;

		expect(describeWavedata(files[mode])).toStrictEqual(fileFacts);
		expect(validateWavedata(files[mode])).toStrictEqual([]);
	},
);

test('the range in sample units keeps the quiet end below the loud end', async () => {
	const { golden } = await readGolden();
	const [quiet, loud] = rmsRangeInSampleUnits(golden.average.facts);

	// Level 82 is -40.7 dB, level 255 is full scale
	expect(quiet).toBeCloseTo(128 * 10 ** (-40.7 / 20), 1);
	expect(loud).toBe(128);
});

test('records past the end of the targets are dropped, not thrown on', async () => {
	const { files, golden } = await readGolden();
	const target = { levels: new Uint8Array(3), rms: new Float32Array(4), samples: new Int8Array(8) };

	splitRecords(files.overall.subarray(headerBytes), target, {
		...golden.overall.facts,
		fromRecord: 0,
	});

	expect([...target.levels]).toStrictEqual([255, 170, 0]);
	expect([...target.samples]).toStrictEqual([64, 64, 0, 0, -1, -1, -128, -127]);
});

test('a file with bands read without a levels buffer still steps a whole record at a time', async () => {
	const { files, golden } = await readGolden();
	const { facts, pairs } = golden.overall;
	const target = { rms: new Float32Array(10), samples: new Int8Array(20) };

	splitRecords(files.overall.subarray(headerBytes), target, { ...facts, fromRecord: 0 });

	expect([...target.samples]).toStrictEqual(pairs.flatMap(([min, max]) => [min, max]));
});

test('the writer reports the sample count it read, for a caller to hold against the source', async () => {
	const { golden } = await readGolden();
	const writer = createWavedataWriter({
		hasBands: true,
		mode: 'overall',
		sampleRate: golden.sampleRate,
	});

	writer.push(goldenInput(golden, 'overall'));

	expect(writer.finish().sampleCount).toBe(golden.sampleCount);
});
