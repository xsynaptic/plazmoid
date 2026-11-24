import type { WavedataMode } from '#format.ts';

import { bandCount, bandEdges } from '#format.ts';

export interface AnalysisLayout {
	hasBands: boolean;
	mode: WavedataMode;
}

const stereoChannels = 2;

// Float keeps a quiet band from rounding to silence; a source that is not stereo is remixed and then fails the writer's 16-bit check
const sourceFormat = 'aformat=sample_fmts=fltp:channel_layouts=stereo';
const crossover = `acrossover=split=${bandEdges.join(' ')}:order=4th[low][mid][high]`;
const monoMix = 'pan=mono|c0=0.5*c0+0.5*c1';

export function analysisChannelCount({ hasBands, mode }: AnalysisLayout): number {
	if (!hasBands) return stereoChannels;

	return stereoChannels + bandCount * bandChannelCount(mode);
}

export function bandChannelCount(mode: WavedataMode): number {
	return mode === 'average' ? 1 : stereoChannels;
}

export function analysisArguments({
	hasBands,
	mode,
	source,
}: AnalysisLayout & { source: string }): Array<string> {
	return [
		'-nostdin',
		'-v',
		'error',
		// Cover art is a video stream, and ffmpeg otherwise stops the decode where it ends
		'-vn',
		'-i',
		source,
		'-filter_complex',
		analysisGraph({ hasBands, mode }),
		'-map',
		'[analysis]',
		'-f',
		'f32le',
		'-',
	];
}

function analysisGraph({ hasBands, mode }: AnalysisLayout): string {
	if (!hasBands) return `[0:a]${sourceFormat}[analysis]`;

	const split = mode === 'average' ? `${monoMix},${crossover}` : crossover;

	return [
		`[0:a]${sourceFormat},asplit=2[raw][split]`,
		`[split]${split}`,
		`[raw][low][mid][high]amerge=inputs=${String(1 + bandCount)}[analysis]`,
	].join(';');
}
