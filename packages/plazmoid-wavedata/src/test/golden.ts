import { readFile } from 'node:fs/promises';

import type { WavedataFacts } from '#descriptor.ts';
import type { WavedataMode } from '#format.ts';

interface StereoRun {
	frames: number;
	left: number;
	right: number;
}

interface BandRun {
	frames: number;
	high: Array<number> | number;
	low: Array<number> | number;
	mid: Array<number> | number;
}

interface Expected {
	facts: WavedataFacts;
	levels: Array<[low: number, mid: number, high: number]>;
	pairs: Array<[min: number, max: number, rms: number]>;
}

export interface Golden extends Record<WavedataMode, Expected> {
	bands: Record<WavedataMode, Array<BandRun>>;
	sampleCount: number;
	sampleRate: number;
	stereo: Array<StereoRun>;
}

const fixtures = new URL('../../fixtures/v2/', import.meta.url);

export async function readGolden() {
	const [golden, average, overall] = await Promise.all([
		readFile(new URL('golden.json', fixtures), 'utf8'),
		readFile(new URL('average.wavedata', fixtures)),
		readFile(new URL('overall.wavedata', fixtures)),
	]);

	return { files: { average, overall }, golden: JSON.parse(golden) as Golden };
}

// The stream as ffmpeg would write it for the mode: left, right, then the band channels
export function goldenInput(golden: Golden, mode: WavedataMode): Uint8Array {
	const stereo = golden.stereo.flatMap((run) =>
		Array.from({ length: run.frames }, () => [run.left / 32_768, run.right / 32_768]),
	);
	const bands = golden.bands[mode].flatMap((run) =>
		Array.from({ length: run.frames }, () => [run.low, run.mid, run.high].flat()),
	);

	return toBytes(stereo.flatMap((frame, index) => [...frame, ...(bands[index] ?? [])]));
}

export function stereoInput(frames: Array<[left: number, right: number]>): Uint8Array {
	return toBytes(frames.flatMap(([left, right]) => [left / 32_768, right / 32_768]));
}

export function toBytes(samples: Array<number>): Uint8Array {
	const floats = Float32Array.from(samples);

	return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function toHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
