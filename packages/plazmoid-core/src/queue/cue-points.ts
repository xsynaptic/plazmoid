import type { CuePoint } from '#types.ts';

// -1 until the first timestamp, where a track with cue points from part way in begins
export function cueIndexAt(cuePoints: ReadonlyArray<CuePoint>, seconds: number): number {
	let found = -1;

	for (const [index, cue] of cuePoints.entries()) {
		if (cue.startSeconds > seconds) break;

		found = index;
	}

	return found;
}
