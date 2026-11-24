import type { WavedataDescriptor } from '@xsynaptic/plazmoid-wavedata';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { PeaksReader } from '#waveform/waveform-peaks.ts';

import {
	chunkOf,
	offline,
	respondWith,
	sampleWaveform,
	stubWavedataFetch,
} from '#test/wavedata.ts';
import { openPeaks } from '#waveform/waveform-peaks.ts';

function open(name: string, overrides: Partial<WavedataDescriptor> = {}): PeaksReader {
	const source = sampleWaveform(name, overrides);

	return openPeaks(source.url ?? '', source);
}

const withBands = { bands: { medians: [180, 140, 100] } } as const;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test('opens without a request, and a chunk in flight is not asked for again', () => {
	const { chunkRequests } = stubWavedataFetch(offline);
	const reader = open('unasked');

	expect(chunkRequests()).toBe(0);
	expect(reader.durationSeconds).toBe(200);

	void reader.request(0, 1);
	void reader.request(90, 91);
	void reader.request(0, 1);

	expect(reader.pending(0, 91)).toStrictEqual([
		[0, 81.92],
		[81.92, 163.84],
	]);
	expect(chunkRequests()).toBe(2);
});

test('the last chunk is pending only as far as the pairs run, and asks for no byte past its last record', () => {
	const { rangeRequests } = stubWavedataFetch(offline);
	const reader = open('short-tail');

	void reader.request(190, 500);

	expect(reader.pending(190, 500)).toStrictEqual([[163.84, 200]]);
	expect(rangeRequests()).toStrictEqual(['bytes=49184-60031']);
});

test('a short last chunk ends at its partial record and lands at that length', async () => {
	const { rangeRequests } = stubWavedataFetch(() => respondWith(new Uint8Array(905 * 12).fill(7)));
	const reader = open('partial-record', { pairCount: 20_002 });

	await reader.request(199, 200);

	expect(rangeRequests()).toStrictEqual(['bytes=49184-60043']);
	expect(reader.peaks.samples[20_001 * 2]).toBe(7);
	expect(reader.request(199, 200)).toBeUndefined();
});

test('a window with a gap settles only once a chunk has its samples in place', async () => {
	stubWavedataFetch(() => chunkOf(7));

	const reader = open('landing-track');
	const landing = reader.request(0, 1);

	expect(reader.request(0, 1)).toBe(landing);
	expect(reader.pending(0, 1)).toHaveLength(1);

	await landing;
	expect(reader.peaks.samples[0]).toBe(7);
	expect(reader.pending(0, 1)).toHaveLength(0);
	expect(reader.request(0, 1)).toBeUndefined();
});

test('one range per chunk fills the samples, an RMS in their units, and the band levels', async () => {
	const records = new Uint8Array(2048 * 15);

	for (let record = 0; record < 2048; record += 1) {
		records.set([206, 60, 255, 206, 60, 0, 206, 60, 255, 206, 60, 0, 200, 150, 100], record * 15);
	}

	const { rangeRequests } = stubWavedataFetch(() => respondWith(records));
	const reader = open('tinted-track', withBands);

	expect(reader.bands).toMatchObject({ bandCount: 3, framesPerSecond: 25, minDecibels: -60 });
	expect(reader.bands?.medians).toStrictEqual([180, 140, 100]);

	await reader.request(0, 1);

	expect(rangeRequests()).toStrictEqual(['bytes=32-30751']);
	expect([...reader.peaks.samples.subarray(0, 4)]).toStrictEqual([-50, 60, -50, 60]);
	expect([...(reader.peaks.rms?.subarray(0, 2) ?? [])]).toStrictEqual([128, 0]);
	expect(reader.peaks.rms?.[8192]).toBe(0);
	expect([...(reader.bands?.levels.subarray(0, 4) ?? [])]).toStrictEqual([200, 150, 100, 200]);
	expect(reader.peaksWithoutBody.samples).toBe(reader.peaks.samples);
	expect(reader.peaksWithoutBody.rms).toBeUndefined();
});

test("hands the tint the descriptor's RMS range in the units of the samples, not as bytes", () => {
	const reader = open('range-track', { rmsRange: [0, 255] });

	expect(reader.peaks.rmsRange).toStrictEqual([0, 128]);
});

test('a chunk that fails is asked for again as its window settles, after a wait that doubles', async () => {
	const { chunkRequests } = stubWavedataFetch(offline);
	const reader = open('offline-track');
	const askAgain = (): void => {
		void reader.request(0, 1)?.then(askAgain);
	};

	askAgain();

	await vi.advanceTimersByTimeAsync(1999);
	void reader.request(0, 1);
	expect(chunkRequests()).toBe(1);

	await vi.advanceTimersByTimeAsync(1);
	expect(chunkRequests()).toBe(2);

	await vi.advanceTimersByTimeAsync(3999);
	expect(chunkRequests()).toBe(2);

	await vi.advanceTimersByTimeAsync(1);
	expect(chunkRequests()).toBe(3);
});

test.each([
	['ignores the range with a 200', 2048 * 12, 200],
	['sends a 206 longer than the range', 2048 * 12 + 12, 206],
	['sends a 206 shorter than the range', 2048 * 12 - 12, 206],
])(
	'a server that %s lands nothing and throws nothing, and the chunk is asked for again',
	async (_, length, status) => {
		const { chunkRequests } = stubWavedataFetch(() =>
			respondWith(new Uint8Array(length).fill(7), status),
		);
		const reader = open(`mis-sized-${String(length)}-${String(status)}`);

		void reader.request(0, 1);
		await vi.advanceTimersByTimeAsync(0);

		expect(reader.peaks.samples[0]).toBe(0);
		expect(reader.pending(0, 1)).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(2000);
		void reader.request(0, 1);

		expect(chunkRequests()).toBe(2);
	},
);

test('keeps only the two readers opened last', () => {
	const first = open('evicted-first');
	const second = open('evicted-second');
	const third = open('evicted-third');

	expect(open('evicted-third')).toBe(third);
	expect(open('evicted-second')).toBe(second);
	expect(open('evicted-first')).not.toBe(first);
});
