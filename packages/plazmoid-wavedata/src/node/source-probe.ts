import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export interface SourceProbe {
	frameCount: number;
	sampleRate: number;
}

const run = promisify(execFile);

const stereoChannels = 2;
// ALAC decodes to the planar form
const sixteenBitFormats = new Set(['s16', 's16p']);
const riffHeaderBytes = 12;
const chunkHeaderBytes = 8;
const blockAlignAt = 20;

export async function probeSource(source: string): Promise<SourceProbe> {
	const name = path.basename(source);
	const { formatName, stream } = await readProbe(source);
	const sampleRate = Number(stream.sample_rate);
	const problem = sourceProblem(stream, sampleRate);

	if (problem !== undefined) throw new Error(`${name} ${problem}`);

	if (formatName === 'wav') return { frameCount: await readWavFrameCount(source), sampleRate };

	const frameCount = stream.duration_ts;

	if (typeof frameCount !== 'number' || !Number.isSafeInteger(frameCount) || frameCount <= 0) {
		throw new Error(`${name} has no frame count ffprobe can read`);
	}

	return { frameCount, sampleRate };
}

async function readProbe(
	source: string,
): Promise<{ formatName: unknown; stream: Record<string, unknown> }> {
	const { stdout } = await run('ffprobe', [
		'-v',
		'error',
		'-select_streams',
		'a:0',
		'-show_entries',
		'stream=channels,sample_fmt,sample_rate,time_base,duration_ts:format=format_name',
		'-of',
		'json',
		source,
	]);
	const { format, streams } = JSON.parse(stdout) as {
		format?: { format_name?: unknown };
		streams?: Array<Record<string, unknown>>;
	};
	const [stream] = streams ?? [];

	if (!stream) throw new Error(`${path.basename(source)} has no audio stream`);

	return { formatName: format?.format_name, stream };
}

function sourceProblem(
	{ channels, sample_fmt: sampleFormat, time_base: timeBase }: Record<string, unknown>,
	sampleRate: number,
): string | undefined {
	if (channels !== stereoChannels) return `has ${String(channels)} channels, not two`;

	if (typeof sampleFormat !== 'string' || !sixteenBitFormats.has(sampleFormat)) {
		return `is ${String(sampleFormat)}, not 16-bit PCM`;
	}

	if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
		return 'has no sample rate ffprobe can read';
	}

	// `duration_ts` counts frames only when the time base is one frame, as FLAC's is
	if (timeBase !== `1/${String(sampleRate)}`) {
		return `has a time base of ${String(timeBase)}, not one frame`;
	}

	return undefined;
}

// ffprobe measures a WAV by the bytes present, so only its data chunk's declared size shows a truncated one
async function readWavFrameCount(source: string): Promise<number> {
	const name = path.basename(source);
	const handle = await open(source, 'r');

	try {
		const { size } = await handle.stat();
		const header = Buffer.alloc(24);

		await handle.read(header, 0, riffHeaderBytes, 0);

		if (header.toString('latin1', 0, 4) !== 'RIFF' || header.toString('latin1', 8, 12) !== 'WAVE') {
			throw new Error(`${name} is not a RIFF WAVE file`);
		}

		let blockAlign = 0;
		let offset = riffHeaderBytes;

		while (offset + chunkHeaderBytes <= size) {
			await handle.read(header, 0, header.length, offset);

			const id = header.toString('latin1', 0, 4);
			const chunkSize = header.readUInt32LE(4);

			if (id === 'fmt ') blockAlign = header.readUInt16LE(blockAlignAt);
			if (id === 'data' && blockAlign > 0) return Math.floor(chunkSize / blockAlign);

			offset += chunkHeaderBytes + chunkSize + (chunkSize % 2);
		}

		throw new Error(`${name} has no format and data chunks`);
	} finally {
		await handle.close();
	}
}
