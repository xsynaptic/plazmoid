# @xsynaptic/plazmoid-wavedata

The waveform format the Plazmoid audio player draws from, with functions to write, read and check it. The main entry works on bytes only, with no fetching, no state and no dependencies.

The format is documented in [FORMAT.md](FORMAT.md), with reference files in `fixtures/v2/`.

From Node, `./node` probes a source with `ffprobe`, decodes it with `ffmpeg` and returns the finished file:

```ts
import { writeSourceWavedata } from '@xsynaptic/plazmoid-wavedata/node';

const { facts, file } = await writeSourceWavedata({ hasBands: true, mode: 'overall', source });

const descriptor = { ...facts, url: fileUrl };
```

The descriptor goes in a track's details as `waveform`, so the player can draw the overview at once and request just the bytes it needs for the rest.

The source must be 16-bit stereo PCM, and `writeSourceWavedata` throws on anything else. Convert a lossy or higher-resolution source to 16-bit first. It also throws when ffmpeg prints an error, or when the decode holds fewer frames than the source declares: ffmpeg exits 0 on a truncated or damaged file and decodes what it can, so the frame count is the only check that the whole source was read.

Elsewhere, `createWavedataWriter` takes the output of one ffmpeg command, and hands out that command's arguments itself (`writer.analysisArguments(source)`) so the two always agree. Running the decode and holding `sampleCount` against the source's own length are then up to you.

`writerRevision` changes when the same source would write different bytes or facts. Store it, or a hash that includes it, beside each file to find the ones written under older rules.

The fixtures were assembled by hand from the tables in FORMAT.md, so a writer in another language that reproduces them matches the spec and not just this package.
