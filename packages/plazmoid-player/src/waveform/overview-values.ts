import { levelAmplitude, overviewBuckets } from '@xsynaptic/plazmoid-wavedata';

// `undefined` where the text is not base64 or runs past the spec's ceiling, so a damaged overview draws a plain groove
export function decodeOverview(encoded: string): Float32Array | undefined {
	let bytes: string;

	try {
		bytes = atob(encoded);
	} catch {
		return undefined;
	}

	if (bytes.length > overviewBuckets) return undefined;

	const amplitudes = Float32Array.from(bytes, (byte) => levelAmplitude(byte.codePointAt(0) ?? 0));
	let loudest = 0;

	for (const amplitude of amplitudes) loudest = Math.max(loudest, amplitude);

	if (loudest === 0) return amplitudes;

	return amplitudes.map((amplitude) => amplitude / loudest);
}
