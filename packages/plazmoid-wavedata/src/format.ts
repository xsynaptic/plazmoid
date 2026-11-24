export const formatVersion = 2;
export const magic = 'PZWD';

export const headerBytes = 32;
export const samplesPerPair = 256;
export const pairsPerRecord = 4;
export const samplesPerRecord = samplesPerPair * pairsPerRecord;
export const pairBytes = 3;
export const bandCount = 3;
export const recordsPerChunk = 2048;

export const bandEdges = [200, 2000] as const;
export const decibelRange = 60;
export const levelFullScale = 255;
export const sourceFullScale = 32_768;
// What one stored minimum or maximum step is worth, in source samples
export const peakDivisor = 256;
export const peakFullScale = sourceFullScale / peakDivisor;

export const overviewBuckets = 400;

export const modeCodes = { average: 1, overall: 2 } as const;

export type WavedataMode = keyof typeof modeCodes;

export const bandsFieldBit = 1;

export function recordBytes(hasBands: boolean): number {
	return pairsPerRecord * pairBytes + (hasBands ? bandCount : 0);
}
