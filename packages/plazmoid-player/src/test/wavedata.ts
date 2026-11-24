import type { WavedataDescriptor } from '@xsynaptic/plazmoid-wavedata';

import { formatVersion, recordBytes, recordsPerChunk } from '@xsynaptic/plazmoid-wavedata';
import { vi } from 'vitest';

// 100 pairs a second, so 20,000 pairs run 200 seconds in chunks of 81.92 and the third is short
export function sampleWaveform(
	name: string,
	overrides: Partial<WavedataDescriptor> = {},
): WavedataDescriptor {
	return {
		formatVersion,
		mode: 'overall',
		overview: '',
		pairCount: 20_000,
		rmsRange: [168, 236],
		sampleRate: 25_600,
		url: `https://files.test/waveform/${name}.wavedata`,
		...overrides,
	};
}

export function respondWith(bytes: Uint8Array<ArrayBuffer>, status = 206): Promise<Response> {
	return Promise.resolve(new Response(bytes, { status }));
}

export function chunkOf(byte: number, { hasBands = false } = {}): Promise<Response> {
	return respondWith(new Uint8Array(recordsPerChunk * recordBytes(hasBands)).fill(byte));
}

export function offline(): Promise<Response> {
	return Promise.reject(new TypeError('Failed to fetch'));
}

export function stubWavedataFetch(respond: (url: string) => Promise<Response>) {
	const fetchMock = vi.fn((url: string, _init?: RequestInit) => respond(url));

	vi.stubGlobal('fetch', fetchMock);

	return {
		chunkRequests: () => fetchMock.mock.calls.length,
		rangeRequests: () =>
			fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range')),
		urls: () => fetchMock.mock.calls.map(([url]) => url),
	};
}
