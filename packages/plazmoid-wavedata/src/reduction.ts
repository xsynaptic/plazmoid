import type { AnalysisLayout } from '#analysis-arguments.ts';

import { analysisChannelCount, bandChannelCount } from '#analysis-arguments.ts';
import {
	bandCount,
	peakDivisor,
	samplesPerPair,
	samplesPerRecord,
	sourceFullScale,
} from '#format.ts';
import { toLevel } from '#levels.ts';
import { createSink } from '#sink.ts';

export interface Reduced {
	levels: Uint8Array;
	pairs: Uint8Array;
	// Unrounded, so the overview reduces from the samples and not from stored bytes
	pairSquares: Float64Array;
	sampleCount: number;
	valuesPerFrame: number;
}

const firstBandChannel = 2;

export const sourceMeanSquareScale = sourceFullScale ** 2;

export function createReduction(layout: AnalysisLayout) {
	const { hasBands, mode } = layout;
	const channels = analysisChannelCount(layout);
	const isAverage = mode === 'average';
	const valuesPerFrame = isAverage ? 1 : 2;
	const bandChannels = channels - firstBandChannel;
	const bandWidth = bandChannelCount(mode);

	const pairs = createSink((length) => new Uint8Array(length));
	const levels = createSink((length) => new Uint8Array(length));
	const pairSquares = createSink((length) => new Float64Array(length));
	const bandSquares = new Float64Array(bandCount);

	let sampleCount = 0;
	let low = 0;
	let high = 0;
	let squares = 0;

	function closePair(frames: number): void {
		pairs.add(Math.trunc(low / peakDivisor));
		pairs.add(Math.trunc(high / peakDivisor));
		pairs.add(toLevel(squares / (frames * valuesPerFrame * sourceMeanSquareScale)));
		pairSquares.add(squares);
		squares = 0;
	}

	function closeRecord(frames: number): void {
		if (!hasBands) return;

		for (const sum of bandSquares) levels.add(toLevel(sum / (frames * bandWidth)));

		bandSquares.fill(0);
	}

	function addValue(value: number, isPairStart: boolean): void {
		if (isPairStart || value < low) low = value;
		if (isPairStart || value > high) high = value;

		squares += value * value;
	}

	function addBands(samples: Float32Array, at: number): void {
		for (let channel = 0; channel < bandChannels; channel += 1) {
			const value = samples[at + channel] ?? 0;
			const band = Math.floor(channel / bandWidth);

			bandSquares[band] = (bandSquares[band] ?? 0) + value * value;
		}
	}

	return {
		addFrames: (samples: Float32Array): void => {
			for (let at = 0; at < samples.length; at += channels) {
				const left = toSourceSample(samples[at]);
				const right = toSourceSample(samples[at + 1]);
				const isPairStart = sampleCount % samplesPerPair === 0;

				if (isAverage) {
					// The integer mix `audiowaveform` makes; ffmpeg's `pan` is half a step off it
					addValue(Math.trunc((left + right) / 2), isPairStart);
				} else {
					addValue(left, isPairStart);
					addValue(right, false);
				}

				addBands(samples, at + firstBandChannel);
				sampleCount += 1;

				if (sampleCount % samplesPerPair === 0) closePair(samplesPerPair);
				if (sampleCount % samplesPerRecord === 0) closeRecord(samplesPerRecord);
			}
		},
		close: (): Reduced => {
			if (sampleCount % samplesPerPair !== 0) closePair(sampleCount % samplesPerPair);
			if (sampleCount % samplesPerRecord !== 0) closeRecord(sampleCount % samplesPerRecord);

			return {
				levels: levels.read().subarray(0, levels.length),
				pairs: pairs.read().subarray(0, pairs.length),
				pairSquares: pairSquares.read().subarray(0, pairSquares.length),
				sampleCount,
				valuesPerFrame,
			};
		},
	};
}

// A 16-bit sample survives the trip through a float exactly; anything else leaves a fraction
function toSourceSample(value: number | undefined): number {
	const sample = (value ?? NaN) * sourceFullScale;

	if (!Number.isSafeInteger(sample) || sample < -sourceFullScale || sample >= sourceFullScale) {
		throw new Error(`The source is not 16-bit PCM: a sample decodes to ${String(sample)}`);
	}

	return sample;
}
