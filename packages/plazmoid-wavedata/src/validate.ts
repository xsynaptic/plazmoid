import type { WavedataHeader } from '#header.ts';

import { headerBytes, pairBytes, pairsPerRecord, recordBytes } from '#format.ts';
import { inspectHeader } from '#header.ts';

interface Fault {
	count: number;
	first: number;
	isBroken: (min: number, max: number, rms: number) => boolean;
	rule: string;
}

// Structure only: a file whose values are scaled or rounded wrongly passes, and only the fixtures catch it
export function validateWavedata(file: Uint8Array): Array<string> {
	const { header, problems } = inspectHeader(file);

	if (!header) return problems;

	const recordCount = Math.ceil(header.pairCount / pairsPerRecord);
	const expected = headerBytes + recordCount * recordBytes(header.hasBands);

	if (file.length !== expected) {
		return [
			...problems,
			`The file is ${String(file.length)} bytes, expected ${String(expected)} for ${String(header.pairCount)} pairs`,
		];
	}

	return [...problems, ...pairProblems(file, header)];
}

function pairProblems(file: Uint8Array, { hasBands, pairCount }: WavedataHeader): Array<string> {
	const fields = new Int8Array(file.buffer, file.byteOffset, file.length);
	const recordSize = recordBytes(hasBands);
	const slots = Math.ceil(pairCount / pairsPerRecord) * pairsPerRecord;
	const stored: Array<Fault> = [
		{ count: 0, first: 0, isBroken: (min, max) => min > max, rule: 'a minimum above the maximum' },
		{
			count: 0,
			first: 0,
			isBroken: (min, max, rms) => rms === 0 && (min !== 0 || max !== 0),
			rule: 'a peak in digital silence',
		},
	];
	const empty: Array<Fault> = [
		{
			count: 0,
			first: 0,
			isBroken: (min, max, rms) => min !== 0 || max !== 0 || rms !== 0,
			rule: 'bytes past the pair count',
		},
	];

	for (let slot = 0; slot < slots; slot += 1) {
		const record = Math.floor(slot / pairsPerRecord);
		const at = headerBytes + record * recordSize + (slot % pairsPerRecord) * pairBytes;

		tally(slot < pairCount ? stored : empty, slot, fields.subarray(at, at + pairBytes));
	}

	return [...stored, ...empty]
		.filter((fault) => fault.count > 0)
		.map(
			(fault) =>
				`The file has ${fault.rule} in ${String(fault.count)} pairs, the first at pair ${String(fault.first)}`,
		);
}

function tally(faults: Array<Fault>, slot: number, pair: Int8Array): void {
	const [min = 0, max = 0, rms = 0] = pair;

	for (const fault of faults) {
		if (!fault.isBroken(min, max, rms)) continue;
		if (fault.count === 0) fault.first = slot;

		fault.count += 1;
	}
}
