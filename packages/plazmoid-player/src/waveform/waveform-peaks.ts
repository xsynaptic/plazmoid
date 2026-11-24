import type { RecordTargets, WavedataDescriptor } from '@xsynaptic/plazmoid-wavedata';
import type { WaveformBands, WaveformPeaks } from '@xsynaptic/sonic-ui';

import {
	bandCount,
	decibelRange,
	pairsPerRecord,
	recordsByteRange,
	recordsPerChunk,
	rmsRangeInSampleUnits,
	samplesPerPair,
	samplesPerRecord,
	splitRecords,
} from '@xsynaptic/plazmoid-wavedata';

import { retryDelayMs } from '#waveform/retry-delay.ts';

// One reader per address, so a chunk that landed is never asked for twice

const chunkPairs = recordsPerChunk * pairsPerRecord;

const cacheLimit = 2;

const cache = new Map<string, PeaksReader>();

export interface PeaksReader {
	bands: undefined | WaveformBands;
	durationSeconds: number;
	// Silent where a chunk has not landed
	peaks: WaveformPeaks;
	// The same samples without RMS, for a surface that draws no body
	peaksWithoutBody: WaveformPeaks;
	pending: (fromSeconds: number, toSeconds: number) => Array<[number, number]>;
	// `undefined` once the window has landed; otherwise settles on the next change, for the caller to ask again
	request: (fromSeconds: number, toSeconds: number) => Promise<void> | undefined;
}

interface ChunkRequest {
	failures: number;
	isHeld: boolean;
}

export function openPeaks(url: string, source: WavedataDescriptor): PeaksReader {
	const cached = cache.get(url);
	if (cached) return cached;

	const reader = createReader(url, source);

	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value;

		if (oldest !== undefined) cache.delete(oldest);
	}

	cache.set(url, reader);

	return reader;
}

// A 200 ignored the range; a 206 of any other length can't be placed, since CORS hides `Content-Range`
async function fetchRange(
	url: string,
	[start, end]: [start: number, end: number],
): Promise<Uint8Array | undefined> {
	try {
		const response = await fetch(url, {
			headers: { Range: `bytes=${String(start)}-${String(end - 1)}` },
		});

		if (response.status !== 206) {
			await response.body?.cancel();
			return undefined;
		}

		const bytes = new Uint8Array(await response.arrayBuffer());

		return bytes.length === end - start ? bytes : undefined;
	} catch {
		return undefined;
	}
}

function toWaveformBands(
	{ medians }: NonNullable<WavedataDescriptor['bands']>,
	{ pairCount, sampleRate }: WavedataDescriptor,
): WaveformBands & { levels: Uint8Array } {
	return {
		bandCount,
		framesPerSecond: sampleRate / samplesPerRecord,
		levels: new Uint8Array(Math.ceil(pairCount / pairsPerRecord) * bandCount),
		medians,
		minDecibels: -decibelRange,
	};
}

function createReader(url: string, source: WavedataDescriptor): PeaksReader {
	const { bands, pairCount, sampleRate } = source;
	const pairsPerSecond = sampleRate / samplesPerPair;
	const samples = new Int8Array(pairCount * 2);
	const rms = new Float32Array(pairCount);
	const waveformBands = bands && toWaveformBands(bands, source);
	const targets: RecordTargets = waveformBands
		? { levels: waveformBands.levels, rms, samples }
		: { rms, samples };
	const chunkCount = Math.ceil(pairCount / chunkPairs);
	const landed = new Set<number>();
	const requests = new Map<number, ChunkRequest>();
	let announce: () => void;
	let changed: Promise<void>;

	function awaitChange(): void {
		changed = new Promise((resolve) => {
			announce = () => {
				awaitChange();
				resolve();
			};
		});
	}

	awaitChange();

	function chunksIn(fromSeconds: number, toSeconds: number): Array<number> {
		const first = Math.floor(Math.max(0, fromSeconds * pairsPerSecond) / chunkPairs);
		const last = Math.min(
			chunkCount - 1,
			Math.floor(Math.max(0, toSeconds * pairsPerSecond) / chunkPairs),
		);

		const chunks: Array<number> = [];

		for (let chunk = first; chunk <= last; chunk += 1) chunks.push(chunk);

		return chunks;
	}

	async function load(chunk: number, request: ChunkRequest): Promise<void> {
		const fromRecord = chunk * recordsPerChunk;
		const range = recordsByteRange(source, fromRecord, fromRecord + recordsPerChunk);
		const bytes = range && (await fetchRange(url, range));

		if (bytes) {
			splitRecords(bytes, targets, { ...source, fromRecord });
			landed.add(chunk);
			announce();
			return;
		}

		request.failures += 1;
		setTimeout(() => {
			request.isHeld = false;
			announce();
		}, retryDelayMs(request.failures));
	}

	return {
		bands: waveformBands,
		durationSeconds: pairCount / pairsPerSecond,
		peaks: { pairsPerSecond, rms, rmsRange: rmsRangeInSampleUnits(source), samples },
		peaksWithoutBody: { pairsPerSecond, samples },
		pending: (fromSeconds, toSeconds) =>
			chunksIn(fromSeconds, toSeconds)
				.filter((chunk) => !landed.has(chunk))
				.map((chunk) => [
					(chunk * chunkPairs) / pairsPerSecond,
					Math.min(pairCount, (chunk + 1) * chunkPairs) / pairsPerSecond,
				]),
		request: (fromSeconds, toSeconds) => {
			let hasGap = false;

			for (const chunk of chunksIn(fromSeconds, toSeconds)) {
				if (landed.has(chunk)) continue;

				hasGap = true;

				const held = requests.get(chunk) ?? { failures: 0, isHeld: false };
				if (held.isHeld) continue;

				held.isHeld = true;
				requests.set(chunk, held);
				void load(chunk, held);
			}

			return hasGap ? changed : undefined;
		},
	};
}
