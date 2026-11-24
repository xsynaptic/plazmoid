export type { AnalysisLayout } from '#analysis-arguments.ts';
export { describeWavedata } from '#describe.ts';
export type { WavedataDescriptor, WavedataFacts, WavedataFileFacts } from '#descriptor.ts';
export type { WavedataMode } from '#format.ts';
export {
	bandCount,
	bandEdges,
	decibelRange,
	formatVersion,
	headerBytes,
	modeCodes,
	overviewBuckets,
	pairsPerRecord,
	recordBytes,
	recordsPerChunk,
	samplesPerPair,
	samplesPerRecord,
} from '#format.ts';
export type { WavedataHeader } from '#header.ts';
export { parseHeader } from '#header.ts';
export { levelAmplitude } from '#levels.ts';
export type { RecordTargets } from '#slices.ts';
export { recordsByteRange, rmsRangeInSampleUnits, splitRecords } from '#slices.ts';
export { validateWavedata } from '#validate.ts';
export type { WavedataWriter, WavedataWriterOptions } from '#writer.ts';
export { createWavedataWriter } from '#writer.ts';
