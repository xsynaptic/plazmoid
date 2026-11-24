import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, statSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { writeSourceWavedata } from '#node.ts';

const sampleRate = 44_100;
const seconds = 3;
const layout = { hasBands: true, mode: 'overall' } as const;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

const scratch = mkdtempSync(path.join(tmpdir(), 'wavedata-node-'));
const source = path.join(scratch, 'source.flac');

function ffmpeg(...parameters: Array<string>): void {
	const { status, stderr } = spawnSync('ffmpeg', ['-v', 'error', '-y', ...parameters]);

	if (status !== 0) throw new Error(stderr.toString());
}

function generate(name: string, input: string, ...encoding: Array<string>): string {
	const target = path.join(scratch, name);

	ffmpeg('-f', 'lavfi', '-i', input, '-t', String(seconds), ...encoding, target);

	return target;
}

beforeAll(() => {
	if (!hasFfmpeg) return;

	generate('source.flac', `sine=frequency=440:sample_rate=${String(sampleRate)}`, '-ac', '2');
});

afterAll(() => {
	rmSync(scratch, { force: true, recursive: true });
});

describe.skipIf(!hasFfmpeg)('writeSourceWavedata', () => {
	test('reads every frame of a sound source', async () => {
		const { facts, sampleCount } = await writeSourceWavedata({ ...layout, source });

		expect(sampleCount).toBe(seconds * sampleRate);
		expect(facts.pairCount).toBe(Math.ceil(sampleCount / 256));
	});

	test('refuses a truncated source, which ffmpeg decodes short and still exits 0 on', async () => {
		const truncated = path.join(scratch, 'truncated.flac');

		copyFileSync(source, truncated);
		truncateSync(truncated, Math.floor(statSync(source).size / 2));

		await expect(writeSourceWavedata({ ...layout, source: truncated })).rejects.toThrow(
			/but the source has|ffmpeg reported errors/,
		);
	});

	test('refuses a WAV cut on a frame boundary, which ffprobe measures by the bytes left', async () => {
		const cut = path.join(scratch, 'cut.wav');

		ffmpeg('-i', source, cut);
		truncateSync(cut, statSync(cut).size - 4 * sampleRate);

		await expect(writeSourceWavedata({ ...layout, source: cut })).rejects.toThrow(
			/but the source has/,
		);
	});

	test('refuses a silent mono source, whose remix to stereo would pass the 16-bit check', async () => {
		const mono = generate('silent-mono.flac', `anullsrc=r=${String(sampleRate)}:cl=mono`);

		await expect(writeSourceWavedata({ ...layout, source: mono })).rejects.toThrow(
			/1 channels, not two/,
		);
	});

	test('refuses a 24-bit source before decoding it', async () => {
		const deep = generate(
			'deep.flac',
			`sine=frequency=440:sample_rate=${String(sampleRate)}`,
			'-ac',
			'2',
			'-sample_fmt',
			's32',
			'-bits_per_raw_sample',
			'24',
		);

		await expect(writeSourceWavedata({ ...layout, source: deep })).rejects.toThrow(
			/s32, not 16-bit PCM/,
		);
	});
});
