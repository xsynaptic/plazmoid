import type { WavedataFileFacts } from '#descriptor.ts';

import {
	bandCount,
	formatVersion,
	headerBytes,
	levelFullScale,
	pairBytes,
	pairsPerRecord,
	recordBytes,
} from '#format.ts';
import { parseHeader } from '#header.ts';
import { medianOf, rmsRangeOf } from '#levels.ts';

const rmsField = 2;
const bandsAt = pairsPerRecord * pairBytes;

export function describeWavedata(file: Uint8Array): WavedataFileFacts {
	const { hasBands, mode, pairCount, sampleRate } = parseHeader(file);
	const recordSize = recordBytes(hasBands);
	const recordCount = Math.ceil(pairCount / pairsPerRecord);

	if (file.length < headerBytes + recordCount * recordSize) {
		throw new Error('The file is truncated');
	}

	const rmsCounts = new Uint32Array(levelFullScale + 1);

	for (let pair = 0; pair < pairCount; pair += 1) {
		const record = Math.floor(pair / pairsPerRecord);
		const slot = pair % pairsPerRecord;

		tally(rmsCounts, file[headerBytes + record * recordSize + slot * pairBytes + rmsField]);
	}

	const facts = { formatVersion, mode, pairCount, rmsRange: rmsRangeOf(rmsCounts), sampleRate };

	if (!hasBands) return facts;

	const [low = 0, mid = 0, high = 0] = Array.from({ length: bandCount }, (_, band) => {
		const counts = new Uint32Array(levelFullScale + 1);

		for (let record = 0; record < recordCount; record += 1) {
			tally(counts, file[headerBytes + record * recordSize + bandsAt + band]);
		}

		return medianOf(counts);
	});

	return { ...facts, bands: { medians: [low, mid, high] } };
}

function tally(counts: Uint32Array, level: number | undefined): void {
	if (level === undefined) return;

	counts[level] = (counts[level] ?? 0) + 1;
}
