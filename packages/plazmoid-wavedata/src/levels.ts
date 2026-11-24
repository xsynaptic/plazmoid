import { decibelRange, levelFullScale, peakFullScale } from '#format.ts';

// A quiet signal never writes 0, which a reader takes for silence or for a stretch not yet loaded
export function toLevel(meanSquare: number): number {
	if (meanSquare === 0) return 0;

	const decibels = 10 * Math.log10(meanSquare);
	const level = Math.round(levelFullScale * (1 + decibels / decibelRange));

	return Math.min(levelFullScale, Math.max(1, level));
}

// Linear amplitude with full scale at 1
export function levelAmplitude(level: number): number {
	if (level <= 0) return 0;

	return 10 ** (((level / levelFullScale - 1) * decibelRange) / 20);
}

// In the units of the stored minimum and maximum, so a body draws on the same scale as its peaks
export const levelSampleUnits = Float32Array.from(
	{ length: levelFullScale + 1 },
	(_, level) => levelAmplitude(level) * peakFullScale,
);

function levelAtShare(counts: Uint32Array, share: number, lowest: number): number {
	let total = 0;

	for (let level = lowest; level < counts.length; level += 1) total += counts[level] ?? 0;

	if (total === 0) return 0;

	const rank = Math.max(1, Math.ceil(share * total));
	let seen = 0;

	for (let level = lowest; level < counts.length; level += 1) {
		seen += counts[level] ?? 0;
		if (seen >= rank) return level;
	}

	return 0;
}

const quietShare = 0.1;
const loudShare = 0.95;
const medianShare = 0.5;
// Level 1 is at or below the floor, and the range reads pairs above it
const lowestRangeLevel = 2;

export function rmsRangeOf(counts: Uint32Array): [quiet: number, loud: number] {
	return [
		levelAtShare(counts, quietShare, lowestRangeLevel),
		levelAtShare(counts, loudShare, lowestRangeLevel),
	];
}

export function medianOf(counts: Uint32Array): number {
	return levelAtShare(counts, medianShare, 1);
}
