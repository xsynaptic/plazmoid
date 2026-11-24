import { createWavedataWriter } from '@xsynaptic/plazmoid-wavedata';

const sampleRate = 44_100;
const fixtureSeconds = 60;
// Left and right, then each band's left and right, low first, as the overall graph lays them out
const channelCount = 8;

// A whole number of 16-bit steps, which the writer requires of its stereo channels
function amplitudeAt(second: number): number {
	return Math.round(12_000 + 10_000 * Math.abs(Math.sin(second / 5))) / 32_768;
}

function secondOf(second: number): Uint8Array {
	const amplitude = amplitudeAt(second);
	const samples = new Float32Array(sampleRate * channelCount);

	for (let frame = 0; frame < sampleRate; frame += 1) {
		const sign = frame % 2 === 0 ? 1 : -1;

		samples.set(
			[sign * amplitude, -sign * amplitude, 0.5, 0.5, 0.1, 0.1, amplitude / 4, amplitude / 4],
			frame * channelCount,
		);
	}

	return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

export function writeFixtureWavedata() {
	const writer = createWavedataWriter({ hasBands: true, mode: 'overall', sampleRate });

	for (let second = 0; second < fixtureSeconds; second += 1) writer.push(secondOf(second));

	return writer.finish();
}
