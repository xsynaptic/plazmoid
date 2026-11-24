import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, test } from 'vitest';

import type { WavedataMode } from '#format.ts';

import { createWavedataWriter, headerBytes, recordBytes, validateWavedata } from '#index.ts';
import { stereoInput } from '#test/golden.ts';

const sampleRate = 44_100;
const wavHeaderBytes = 44;
const maxBuffer = 64 * 1024 * 1024;

const scratch = mkdtempSync(path.join(tmpdir(), 'wavedata-'));

afterAll(() => {
	rmSync(scratch, { force: true, recursive: true });
});

function hasBinary(name: string): boolean {
	return spawnSync(name, ['--version']).status === 0 || spawnSync(name, ['-version']).status === 0;
}

function writeWav(name: string, channels: Array<Array<number>>): string {
	const [first = []] = channels;
	const blockBytes = channels.length * 2;
	const file = Buffer.alloc(wavHeaderBytes + first.length * blockBytes);

	file.write('RIFF', 0, 'latin1');
	file.writeUInt32LE(file.length - 8, 4);
	file.write('WAVEfmt ', 8, 'latin1');
	file.writeUInt32LE(16, 16);
	file.writeUInt16LE(1, 20);
	file.writeUInt16LE(channels.length, 22);
	file.writeUInt32LE(sampleRate, 24);
	file.writeUInt32LE(sampleRate * blockBytes, 28);
	file.writeUInt16LE(blockBytes, 32);
	file.writeUInt16LE(16, 34);
	file.write('data', 36, 'latin1');
	file.writeUInt32LE(first.length * blockBytes, 40);

	for (const [channel, samples] of channels.entries()) {
		for (const [frame, sample] of samples.entries()) {
			file.writeInt16LE(sample, wavHeaderBytes + frame * blockBytes + channel * 2);
		}
	}

	const target = path.join(scratch, name);

	writeFileSync(target, file);

	return target;
}

// Every value a 16-bit sample takes turns up, the two extremes included
function noise(frames: number, seed: number): Array<number> {
	let state = seed;

	return Array.from({ length: frames }, () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;

		return ((state >> 8) % 65_536) - 32_768;
	});
}

function tone(frames: number, hertz: number): Array<number> {
	return Array.from({ length: frames }, (_, frame) =>
		Math.round(16_384 * Math.sin((2 * Math.PI * hertz * frame) / sampleRate)),
	);
}

function analyze(source: string, mode: WavedataMode) {
	const writer = createWavedataWriter({ hasBands: true, mode, sampleRate });
	const decoded = spawnSync('ffmpeg', writer.analysisArguments(source), { maxBuffer });

	expect(decoded.status).toBe(0);
	writer.push(decoded.stdout);

	return writer.finish();
}

test.skipIf(!hasBinary('audiowaveform'))(
	'average mode stores the minimum and maximum audiowaveform does',
	() => {
		const frames = 256 * 400 + 100;
		const left = noise(frames, 1);
		const right = noise(frames, 2);
		const source = writeWav('noise.wav', [left, right]);
		const reference = path.join(scratch, 'noise.dat');
		const run = spawnSync('audiowaveform', ['-i', source, '-o', reference, '-z', '256', '-b', '8']);

		expect(run.status).toBe(0);

		const data = readFileSync(reference);
		const dataAt = data.readInt32LE(0) === 1 ? 20 : 24;
		const pairCount = data.readUInt32LE(16);
		const writer = createWavedataWriter({ hasBands: false, mode: 'average', sampleRate });

		writer.push(stereoInput(left.map((sample, frame) => [sample, right[frame] ?? 0])));

		const { file } = writer.finish();
		const ours: Array<number> = [];

		for (let pair = 0; pair < pairCount; pair += 1) {
			const at = headerBytes + Math.floor(pair / 4) * recordBytes(false) + (pair % 4) * 3;

			ours.push(file[at] ?? 0, file[at + 1] ?? 0);
		}

		expect(pairCount).toBeGreaterThanOrEqual(400);
		expect(ours).toStrictEqual([...data.subarray(dataAt, dataAt + pairCount * 2)]);
	},
);

test.skipIf(!hasBinary('ffmpeg')).for(['average', 'overall'] as const)(
	'ffmpeg hands the %s writer its channels in the order it reads them',
	(mode) => {
		const frames = sampleRate;
		const source = writeWav('tones.wav', [tone(frames, 100), tone(frames, 1000)]);
		const { facts, file } = analyze(source, mode);
		const [low = 0, mid = 0, high = 0] = facts.bands?.medians ?? [];

		expect(validateWavedata(file)).toStrictEqual([]);
		expect(facts.pairCount).toBe(Math.ceil(frames / 256));
		// A 100 Hz left and a 1 kHz right at one level: bands grouped by channel instead would move the right's tone into high
		expect(low - high).toBeGreaterThan(40);
		expect(mid - high).toBeGreaterThan(40);
		expect(Math.abs(low - mid)).toBeLessThan(4);
	},
);

test.skipIf(!hasBinary('ffmpeg'))('a mono source is refused, not read as stereo', () => {
	const source = writeWav('mono.wav', [noise(sampleRate, 3)]);

	expect(() => analyze(source, 'overall')).toThrow('not 16-bit PCM');
});
