let answer: boolean | undefined;

// iOS Safari makes `volume` read-only, so the slider, the mute gain and any normalization silently do nothing
// Probed rather than sniffed, as Video.js and Media Chrome both do; no UA string answers this
export function canSetVolume(): boolean {
	if (answer !== undefined) return answer;

	/* eslint-disable unicorn/no-top-level-assignment-in-function -- probed once per document; the answer cannot change under it */
	try {
		const probe = document.createElement('audio');

		probe.volume = 0.5;
		answer = probe.volume === 0.5;
	} catch {
		answer = false;
	}
	/* eslint-enable unicorn/no-top-level-assignment-in-function */

	return answer;
}
