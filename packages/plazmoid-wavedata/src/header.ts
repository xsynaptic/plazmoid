import type { WavedataMode } from '#format.ts';

import {
	bandEdges,
	bandsFieldBit,
	decibelRange,
	formatVersion,
	headerBytes,
	magic,
	modeCodes,
	pairsPerRecord,
	recordBytes,
	samplesPerPair,
} from '#format.ts';

export interface WavedataHeader {
	hasBands: boolean;
	mode: WavedataMode;
	pairCount: number;
	sampleCount: number;
	sampleRate: number;
}

const offsets = {
	bandEdges: 24,
	decibelRange: 22,
	fields: 21,
	headerSize: 6,
	mode: 20,
	pairCount: 12,
	pairsPerRecord: 18,
	recordSize: 19,
	reserved: 23,
	sampleCount: 28,
	sampleRate: 8,
	samplesPerPair: 16,
	version: 4,
} as const;

const modeNames = new Map<number, WavedataMode>(
	Object.entries(modeCodes).map(([name, code]) => [code, name as WavedataMode]),
);

export function buildHeader(header: WavedataHeader): Uint8Array {
	const bytes = new Uint8Array(headerBytes);
	const view = new DataView(bytes.buffer);

	for (let index = 0; index < magic.length; index += 1) {
		bytes[index] = magic.codePointAt(index) ?? 0;
	}

	view.setUint16(offsets.version, formatVersion, true);
	view.setUint16(offsets.headerSize, headerBytes, true);
	view.setUint32(offsets.sampleRate, header.sampleRate, true);
	view.setUint32(offsets.pairCount, header.pairCount, true);
	view.setUint16(offsets.samplesPerPair, samplesPerPair, true);
	view.setUint8(offsets.pairsPerRecord, pairsPerRecord);
	view.setUint8(offsets.recordSize, recordBytes(header.hasBands));
	view.setUint8(offsets.mode, modeCodes[header.mode]);
	view.setUint8(offsets.fields, header.hasBands ? bandsFieldBit : 0);
	view.setUint8(offsets.decibelRange, decibelRange);
	view.setUint16(offsets.bandEdges, bandEdges[0], true);
	view.setUint16(offsets.bandEdges + 2, bandEdges[1], true);
	view.setUint32(offsets.sampleCount, header.sampleCount, true);

	return bytes;
}

export function inspectHeader(bytes: Uint8Array): {
	header: undefined | WavedataHeader;
	problems: Array<string>;
} {
	const unreadable = unreadableReason(bytes);

	if (unreadable !== undefined) return { header: undefined, problems: [unreadable] };

	const view = new DataView(bytes.buffer, bytes.byteOffset, headerBytes);
	const fields = view.getUint8(offsets.fields);
	const hasBands = (fields & bandsFieldBit) !== 0;
	const modeCode = view.getUint8(offsets.mode);
	const mode = modeNames.get(modeCode);
	const pairCount = view.getUint32(offsets.pairCount, true);
	const sampleCount = view.getUint32(offsets.sampleCount, true);
	const sampleRate = view.getUint32(offsets.sampleRate, true);

	const expected: Array<[name: string, found: number, value: number]> = [
		['header size', view.getUint16(offsets.headerSize, true), headerBytes],
		['samples per pair', view.getUint16(offsets.samplesPerPair, true), samplesPerPair],
		['pairs per record', view.getUint8(offsets.pairsPerRecord), pairsPerRecord],
		['record size', view.getUint8(offsets.recordSize), recordBytes(hasBands)],
		['fields', fields, hasBands ? bandsFieldBit : 0],
		['decibel range', view.getUint8(offsets.decibelRange), decibelRange],
		['reserved byte', view.getUint8(offsets.reserved), 0],
		['first band edge', view.getUint16(offsets.bandEdges, true), bandEdges[0]],
		['second band edge', view.getUint16(offsets.bandEdges + 2, true), bandEdges[1]],
		['pair count', pairCount, Math.ceil(sampleCount / samplesPerPair)],
	];

	const problems = expected
		.filter(([, found, value]) => found !== value)
		.map(
			([name, found, value]) =>
				`The header has ${name} ${String(found)}, expected ${String(value)}`,
		);

	if (mode === undefined) problems.push(`The header has mode ${String(modeCode)}`);
	if (sampleRate === 0) problems.push('The header has sample rate 0');
	if (sampleCount === 0) problems.push('The header has sample count 0');

	return {
		header: mode === undefined ? undefined : { hasBands, mode, pairCount, sampleCount, sampleRate },
		problems,
	};
}

// A newer layout may move every field, so nothing past the version is read from one
function unreadableReason(bytes: Uint8Array): string | undefined {
	if (bytes.length < headerBytes) return 'The file is shorter than its header';

	if (String.fromCodePoint(...bytes.subarray(0, magic.length)) !== magic) {
		return `The file does not start with ${magic}`;
	}

	const version = new DataView(bytes.buffer, bytes.byteOffset).getUint16(offsets.version, true);

	if (version === formatVersion) return undefined;

	return `The file has version ${String(version)}, expected ${String(formatVersion)}`;
}

export function parseHeader(bytes: Uint8Array): WavedataHeader {
	const { header, problems } = inspectHeader(bytes);
	const [problem] = problems;

	if (problem !== undefined || header === undefined) {
		throw new Error(problem ?? 'The header cannot be read');
	}

	return header;
}
