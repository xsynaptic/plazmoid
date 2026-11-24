import type { AnalysisLayout } from '#analysis-arguments.ts';
import type { WavedataFacts } from '#descriptor.ts';
import type { Reduced } from '#reduction.ts';

import { analysisArguments, analysisChannelCount } from '#analysis-arguments.ts';
import { describeWavedata } from '#describe.ts';
import {
	bandCount,
	headerBytes,
	overviewBuckets,
	pairBytes,
	pairsPerRecord,
	recordBytes,
	samplesPerPair,
} from '#format.ts';
import { buildHeader } from '#header.ts';
import { toLevel } from '#levels.ts';
import { createReduction, sourceMeanSquareScale } from '#reduction.ts';

export interface WavedataWriterOptions extends AnalysisLayout {
	sampleRate: number;
}

export interface WavedataWriter {
	// The arguments after `ffmpeg`; handed out here so the decode and the writer cannot disagree on the layout
	analysisArguments: (source: string) => Array<string>;
	// `sampleCount` is for the caller to hold against the source's own length, since ffmpeg exits 0 on a damaged file
	finish: () => { facts: WavedataFacts; file: Uint8Array<ArrayBuffer>; sampleCount: number };
	// Raw `f32le` bytes from that ffmpeg run, cut anywhere
	push: (bytes: Uint8Array) => void;
}

// Bump when the same source would write different bytes or facts; a host hashes it into its recipe to find stale files
export const writerRevision = 1;

const floatBytes = 4;
const maxSampleCount = 0xff_ff_ff_ff;
const recordPairBytes = pairsPerRecord * pairBytes;

export function createWavedataWriter(options: WavedataWriterOptions): WavedataWriter {
	const { sampleRate } = options;

	if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
		throw new Error(`The sample rate is ${String(sampleRate)}`);
	}

	const frameBytes = analysisChannelCount(options) * floatBytes;
	const reduction = createReduction(options);
	let carry = new Uint8Array(0);

	return {
		analysisArguments: (source) => analysisArguments({ ...options, source }),
		finish: () => {
			if (carry.length > 0) throw new Error('The input ends inside a frame');

			const reduced = reduction.close();

			if (reduced.sampleCount === 0) throw new Error('The input has no samples');

			if (reduced.sampleCount > maxSampleCount) {
				throw new Error('The input is too long for the header');
			}

			const file = assemble(reduced, options);

			return {
				facts: { ...describeWavedata(file), overview: overviewOf(reduced) },
				file,
				sampleCount: reduced.sampleCount,
			};
		},
		push: (bytes) => {
			const data = carry.length === 0 ? bytes : joinBytes(carry, bytes);
			const usable = data.length - (data.length % frameBytes);
			// Copied, since a chunk from a pipe sits at any offset and a float view needs alignment
			const aligned = new Uint8Array(data.subarray(0, usable));

			carry = new Uint8Array(data.subarray(usable));
			reduction.addFrames(
				new Float32Array(aligned.buffer, aligned.byteOffset, usable / floatBytes),
			);
		},
	};
}

function assemble(
	{ levels, pairs, pairSquares, sampleCount }: Reduced,
	{ hasBands, mode, sampleRate }: WavedataWriterOptions,
): Uint8Array<ArrayBuffer> {
	const pairCount = pairSquares.length;
	const recordSize = recordBytes(hasBands);
	const recordCount = Math.ceil(pairCount / pairsPerRecord);
	const file = new Uint8Array(headerBytes + recordCount * recordSize);

	file.set(buildHeader({ hasBands, mode, pairCount, sampleCount, sampleRate }));

	for (let record = 0; record < recordCount; record += 1) {
		const at = headerBytes + record * recordSize;

		file.set(pairs.subarray(record * recordPairBytes, (record + 1) * recordPairBytes), at);
		file.set(levels.subarray(record * bandCount, (record + 1) * bandCount), at + recordPairBytes);
	}

	return file;
}

function overviewOf({ pairSquares, sampleCount, valuesPerFrame }: Reduced): string {
	const pairCount = pairSquares.length;
	const bucketCount = Math.min(overviewBuckets, pairCount);
	const bytes = new Uint8Array(bucketCount);

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = Math.floor((bucket * pairCount) / bucketCount);
		const end = Math.max(Math.floor(((bucket + 1) * pairCount) / bucketCount), start + 1);
		const frames = Math.min(end * samplesPerPair, sampleCount) - start * samplesPerPair;
		let sum = 0;

		for (let pair = start; pair < end; pair += 1) sum += pairSquares[pair] ?? 0;

		bytes[bucket] = toLevel(sum / (frames * valuesPerFrame * sourceMeanSquareScale));
	}

	return btoa(String.fromCodePoint(...bytes));
}

function joinBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
	const joined = new Uint8Array(first.length + second.length);

	joined.set(first);
	joined.set(second, first.length);

	return joined;
}
