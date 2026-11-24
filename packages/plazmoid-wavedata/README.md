# @xsynaptic/plazmoid-wavedata

The waveform format the Plazmoid audio player draws from, with functions to write, read and check it. It works on bytes only, with no fetching, no state and no dependencies.

The format is documented in [FORMAT.md](FORMAT.md), with reference files in `fixtures/v2/`.

The writer takes the output of one ffmpeg command, and hands out that command's arguments itself so the two always agree. Running ffmpeg and probing the source are up to you: one `ffprobe` call gives both the sample rate the writer needs and the frame count to hold its result against.

```ts
import { spawn } from 'node:child_process';

import { once } from 'node:events';

import { createWavedataWriter, validateWavedata } from '@xsynaptic/plazmoid-wavedata';

const writer = createWavedataWriter({ hasBands: true, mode: 'overall', sampleRate });
const ffmpeg = spawn('ffmpeg', writer.analysisArguments(source));
const exit = once(ffmpeg, 'close');

for await (const chunk of ffmpeg.stdout) writer.push(chunk);

const [code] = await exit;
const { facts, file, sampleCount } = writer.finish();
const problems = validateWavedata(file);

if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
if (sampleCount !== sourceFrameCount) throw new Error('The decode came up short');
if (problems.length > 0) throw new Error(problems.join('; '));

const descriptor = { ...facts, url: fileUrl };
```

The descriptor goes in a track's details as `waveform`, so the player can draw the overview at once and request just the bytes it needs for the rest.

ffmpeg exits 0 on a truncated or damaged file and decodes what it can, so the frame count is the only check that the whole source was read.

The source must be 16-bit stereo PCM; the writer throws on anything else. Convert a lossy or higher-resolution source to 16-bit first.

The fixtures were assembled by hand from the tables in FORMAT.md, so a writer in another language that reproduces them matches the spec and not just this package.
