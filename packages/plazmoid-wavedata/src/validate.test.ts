import { expect, test } from 'vitest';

import { describeWavedata, parseHeader, validateWavedata } from '#index.ts';
import { readGolden } from '#test/golden.ts';

async function damaged(change: (file: Uint8Array) => void) {
	const { files } = await readGolden();
	const file = new Uint8Array(files.overall);

	change(file);

	return file;
}

test('a zeroed header does not pass', () => {
	expect(validateWavedata(new Uint8Array(77))).toStrictEqual(['The file does not start with PZWD']);
});

test('a newer version is refused without reading its layout', async () => {
	const file = await damaged((bytes) => {
		bytes[4] = 3;
	});

	expect(validateWavedata(file)).toStrictEqual(['The file has version 3, expected 2']);
	expect(() => parseHeader(file)).toThrow('version 3');
});

test('an unknown mode is reported', async () => {
	const file = await damaged((bytes) => {
		bytes[20] = 0;
	});

	expect(validateWavedata(file)).toStrictEqual(['The header has mode 0']);
});

test('a pair count that disagrees with the sample count is reported', async () => {
	const file = await damaged((bytes) => {
		bytes[28] = 1;
		bytes[29] = 0x0a;
	});

	expect(validateWavedata(file)).toStrictEqual(['The header has pair count 10, expected 11']);
});

test('a set reserved byte is reported', async () => {
	const file = await damaged((bytes) => {
		bytes[23] = 1;
	});

	expect(validateWavedata(file)).toStrictEqual(['The header has reserved byte 1, expected 0']);
});

test('a truncated file is reported, and is not described', async () => {
	const { files } = await readGolden();
	const file = files.overall.subarray(0, 62);

	expect(validateWavedata(file)).toStrictEqual(['The file is 62 bytes, expected 77 for 10 pairs']);
	expect(() => describeWavedata(file)).toThrow('truncated');
});

test('bytes in a pair slot past the count are reported', async () => {
	const file = await damaged((bytes) => {
		bytes[32 + 2 * 15 + 3 * 3 + 2] = 9;
	});

	expect(validateWavedata(file)).toStrictEqual([
		'The file has bytes past the pair count in 1 pairs, the first at pair 11',
	]);
});

test('swapped minimum and maximum are reported', async () => {
	const file = await damaged((bytes) => {
		bytes[32 + 15] = 64;
		bytes[32 + 15 + 1] = 0xc0;
	});

	expect(validateWavedata(file)).toStrictEqual([
		'The file has a minimum above the maximum in 1 pairs, the first at pair 4',
	]);
});
