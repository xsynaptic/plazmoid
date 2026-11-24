# @xsynaptic/plazmoid-wavedata

The waveform format the Plazmoid audio player draws from, with functions to write, read and check it. It works on bytes only, with no fetching, no state and no dependencies.

The format is documented in [FORMAT.md](FORMAT.md), with reference files in `fixtures/v1/`. Decoding audio and reducing it to the values the format stores is up to you.

```ts
import { buildPeaks, describeWavedata, validateWavedata } from '@xsynaptic/plazmoid-wavedata';

const peaks = buildPeaks(fields, sampleRate);
const problems = validateWavedata({ peaks });

if (problems.length > 0) throw new Error(problems.join('; '));

const descriptor = { ...describeWavedata({ peaks }), url: peaksUrl };
```

The descriptor goes in a track's details as `peaks`, so the player can request just the bytes it needs to draw.

The fixtures were written by hand from the tables in FORMAT.md, so a writer in another language that reproduces them matches the spec and not just this package.
