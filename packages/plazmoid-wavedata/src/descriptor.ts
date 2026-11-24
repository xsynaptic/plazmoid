import type { WavedataMode } from '#format.ts';

export interface WavedataDescriptor {
	// Absent for a file written without bands, which draws untinted
	bands?: { medians: readonly [low: number, mid: number, high: number] };
	formatVersion: number;
	mode: WavedataMode;
	overview: string;
	pairCount: number;
	rmsRange: readonly [quiet: number, loud: number];
	sampleRate: number;
	// Absent draws the overview alone
	url?: string;
}

export type WavedataFacts = Omit<WavedataDescriptor, 'url'>;

export type WavedataFileFacts = Omit<WavedataFacts, 'overview'>;
