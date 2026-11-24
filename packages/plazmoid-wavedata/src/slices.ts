import type { WavedataDescriptor } from '#descriptor.ts';

import { bandCount, headerBytes, pairBytes, pairsPerRecord, recordBytes } from '#format.ts';
import { levelSampleUnits } from '#levels.ts';

export interface RecordTargets {
	levels?: Uint8Array;
	// In the units of `samples`
	rms: Float32Array;
	samples: Int8Array;
}

const bandsAt = pairsPerRecord * pairBytes;

export function recordsByteRange(
	{ bands, pairCount }: Pick<WavedataDescriptor, 'bands' | 'pairCount'>,
	fromRecord: number,
	toRecord: number,
): [start: number, end: number] | undefined {
	const recordSize = recordBytes(bands !== undefined);
	const from = Math.max(0, fromRecord);
	const to = Math.min(Math.ceil(pairCount / pairsPerRecord), toRecord);

	if (to <= from) return undefined;

	return [headerBytes + from * recordSize, headerBytes + to * recordSize];
}

// A slot past the end of a target is dropped, as a typed array drops any write out of range
export function splitRecords(
	bytes: Uint8Array,
	target: RecordTargets,
	{ bands, fromRecord }: Pick<WavedataDescriptor, 'bands'> & { fromRecord: number },
): void {
	const { levels } = target;
	const recordSize = recordBytes(bands !== undefined);
	const records = Math.floor(bytes.length / recordSize);

	for (let record = 0; record < records; record += 1) {
		const fields = bytes.subarray(record * recordSize, (record + 1) * recordSize);
		const into = fromRecord + record;

		splitPairs(fields, target, into * pairsPerRecord);

		if (levels && (into + 1) * bandCount <= levels.length) {
			levels.set(fields.subarray(bandsAt), into * bandCount);
		}
	}
}

function splitPairs(fields: Uint8Array, { rms, samples }: RecordTargets, firstPair: number): void {
	for (let slot = 0; slot < pairsPerRecord; slot += 1) {
		const pair = firstPair + slot;
		const [min = 0, max = 0, level = 0] = fields.subarray(slot * pairBytes);

		samples[pair * 2] = min;
		samples[pair * 2 + 1] = max;
		rms[pair] = levelSampleUnits[level] ?? 0;
	}
}

export function rmsRangeInSampleUnits({
	rmsRange,
}: Pick<WavedataDescriptor, 'rmsRange'>): [quiet: number, loud: number] {
	const [quiet, loud] = rmsRange;

	return [levelSampleUnits[quiet] ?? 0, levelSampleUnits[loud] ?? 0];
}
