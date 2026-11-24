import type { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

import type { AnalysisLayout } from '#analysis-arguments.ts';
import type { WavedataFacts } from '#descriptor.ts';
import type { WavedataWriter } from '#writer.ts';

import { probeSource } from '#node/source-probe.ts';
import { validateWavedata } from '#validate.ts';
import { createWavedataWriter } from '#writer.ts';

export interface SourceWavedata {
	facts: WavedataFacts;
	file: Uint8Array<ArrayBuffer>;
	sampleCount: number;
	sampleRate: number;
}

export async function writeSourceWavedata({
	source,
	...layout
}: AnalysisLayout & { source: string }): Promise<SourceWavedata> {
	const name = path.basename(source);
	const { frameCount, sampleRate } = await probeSource(source);
	const writer = createWavedataWriter({ ...layout, sampleRate });
	const errors = await decodeInto(writer, source);
	const { facts, file, sampleCount } = writer.finish();

	// ffmpeg exits 0 on a truncated or damaged source, so this is the only proof the whole source was read
	if (sampleCount !== frameCount) {
		throw new Error(
			`The waveform of ${name} read ${String(sampleCount)} frames, but the source has ${String(frameCount)}`,
		);
	}

	// ffmpeg exits 0 after a decode error, which `-v error` still prints, even when no frame went missing
	if (errors !== '') throw new Error(`ffmpeg reported errors on ${name}: ${errors}`);

	const problems = validateWavedata(file);

	if (problems.length > 0) {
		throw new Error(`The waveform of ${name} is not valid: ${problems.join('; ')}`);
	}

	return { facts, file, sampleCount, sampleRate };
}

async function decodeInto(writer: WavedataWriter, source: string): Promise<string> {
	const ffmpeg = spawn('ffmpeg', writer.analysisArguments(source), {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let errors = '';

	ffmpeg.stderr.setEncoding('utf8');
	ffmpeg.stderr.on('data', (text: string) => {
		errors += text;
	});

	const feed = async (): Promise<void> => {
		for await (const chunk of ffmpeg.stdout) writer.push(chunk as Buffer);
	};
	// Awaited together, so a failed spawn rejects here instead of going unhandled
	const [[code]] = (await Promise.all([once(ffmpeg, 'close'), feed()])) as [
		[null | number],
		undefined,
	];

	if (code !== 0) {
		throw new Error(`ffmpeg exited ${String(code)} on ${path.basename(source)}: ${errors.trim()}`);
	}

	return errors.trim();
}
