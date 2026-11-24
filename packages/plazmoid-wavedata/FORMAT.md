# Waveform data format, version 2

One binary file describes one stream's waveform. A JSON descriptor, published beside the stream, tells the player everything it needs to fetch it, so the player never reads the file's header. A writer in any language can produce the file from this document and check its output against the files under `fixtures/v2/`.

All integers are little-endian. The file is not compressed, padded or aligned, and it has no trailer.

## Terms

- **Pair**: 256 consecutive samples, reduced to a minimum, a maximum and an RMS.
- **Record**: 1,024 samples, holding four pairs and then, when the file has bands, three band levels.
- **Mode**: how two channels become one shape, chosen when the file is written.
- **Chunk**: 2,048 records (2²¹ samples, 47.55 s at 44.1 kHz), what the player fetches at once. The file knows nothing about chunks.

## Source

The source is 16-bit PCM, two channels, at its own sample rate. A writer refuses anything else; a lossy or higher-resolution source is converted to 16-bit PCM before it reaches the writer. Do not resample; the rate is recorded, and every time is derived from it.

Write `L` and `R` for a frame's two samples as signed 16-bit integers, and `÷` for integer division truncated toward zero, as C and audiowaveform do it.

## Modes

**Average** (the default). Each frame becomes one sample, `M = (L + R) ÷ 2`. A pair's minimum and maximum are the lowest and highest `M`, and its RMS is taken over `M`. The bands split the mono mix. The minimum and maximum bytes are identical to `audiowaveform -z 256 -b 8` (checked against version 1.11.1).

**Overall**, after ffmpeg `astats`. The channels stay apart. A pair's minimum is the lowest of its `L` and `R` samples, its maximum the highest, and its RMS is taken over all 512 samples. Each channel is split into bands, and each band level is taken over both channels.

On a source whose two channels are identical, the modes write identical bytes.

## Bands

Split with a fourth-order Linkwitz-Riley crossover at 200 Hz and 2,000 Hz: low below 200 Hz, mid between, high above 2,000 Hz. Each band is 6 dB down at its edge, and the three sum back to a flat response. The reference is ffmpeg `acrossover=split=200 2000:order=4th`, run on floating-point samples so a quiet band is never rounded to silence; a writer that does not run ffmpeg must match it to within one level.

## Header

32 bytes.

| Offset | Type    | Field            | Value                              |
| ------ | ------- | ---------------- | ---------------------------------- |
| 0      | char[4] | Magic            | `PZWD`                             |
| 4      | uint16  | Version          | 2                                  |
| 6      | uint16  | Header size      | 32                                 |
| 8      | uint32  | Sample rate      | The source's, in hertz             |
| 12     | uint32  | Pair count       | ⌈sample count ÷ 256⌉, never 0      |
| 16     | uint16  | Samples per pair | 256                                |
| 18     | uint8   | Pairs per record | 4                                  |
| 19     | uint8   | Record size      | 15 with bands, 12 without          |
| 20     | uint8   | Mode             | 1: average, 2: overall             |
| 21     | uint8   | Fields           | Bit 0: bands; the other bits are 0 |
| 22     | uint8   | Decibel range    | 60                                 |
| 23     | uint8   | Reserved         | 0                                  |
| 24     | uint16  | First band edge  | 200, in hertz                      |
| 26     | uint16  | Second band edge | 2,000, in hertz                    |
| 28     | uint32  | Sample count     | Frames in the source               |

A mode of 0 is invalid, so a zeroed header never passes. The header size and record size let a tool step through records it does not understand. The sample count counts frames, one per channel pair, so the stream lasts exactly sample count ÷ sample rate seconds and the last pair holds sample count − (pair count − 1) × 256 of them. A source with no samples has no file.

## Records

Record `n` starts at byte 32 + `n` × record size and covers the samples from `n` × 1,024. As a NumPy structured type:

```python
pair = [('min', 'i1'), ('max', 'i1'), ('rms', 'u1')]
record = np.dtype([('pairs', pair, (4,))])
record_with_bands = np.dtype([('pairs', pair, (4,)), ('bands', 'u1', (3,))])

records = np.fromfile(path, dtype=record_with_bands, offset=32)
```

**Minimum and maximum** are the extreme sample `S` reduced to `S ÷ 256`, giving −128 through 127.

**RMS and band levels** are decibel bytes, all on one scale:

1. Take the mean of the squared samples, with full scale at 1.0 (a sample over 32,768).
2. If it is exactly zero, the byte is **0**. Nothing else writes a 0.
3. Otherwise, byte = 255 × (1 + 10 × log₁₀(mean square) ÷ 60), **rounded to nearest**, then clamped to 1 through 255.

So 255 is full scale, 1 is anything at or below −60 dB that is not digital silence, and 0 is digital silence alone.

**Bands** are low, mid and high, each a level over the record's 1,024 samples.

**The last record** holds whatever samples remain. Its RMS and levels divide by the number of samples they actually have, never by the full count. Pair slots past the pair count are three zeros; a reader stops at the pair count.

The file is exactly 32 + ⌈pair count ÷ 4⌉ × record size bytes long.

## Descriptor

The publisher hands the player this. The writer returns all of it but the address; `describeWavedata` reads the same facts back from a finished file, except the overview, which needs the writer's sums.

```json
{
	"formatVersion": 2,
	"url": "https://files.example/streams/example-track.4b1f0c9e.wavedata",
	"sampleRate": 44100,
	"pairCount": 85862,
	"mode": "average",
	"rmsRange": [168, 236],
	"bands": { "medians": [214, 196, 171] },
	"overview": "base64 of up to 400 bytes"
}
```

`url` is where the player fetches the file. A site's own data stores a path or a name instead, and resolves it when it builds the page. A descriptor without `url` draws the overview alone.

The player derives the rest from `formatVersion`: data starts at byte 32; a record is 15 bytes when `bands` is present and 12 when it is not; a pair lasts 256 ÷ sample rate seconds. A player handed a version it does not know draws the track as if it had no descriptor; it never guesses at a newer layout.

**`rmsRange`** is a quiet level and a loud level, as RMS bytes. Take the RMS byte of every pair above the floor, which is every byte of 2 or more, sort ascending, and take the 10th and 95th percentiles by nearest rank: with `n` values, the values at positions ⌈0.10 × `n`⌉ and ⌈0.95 × `n`⌉, counting from 1. A stream with no such pair has `[0, 0]`.

**`bands.medians`** is one level per band, low first: the median by nearest rank (position ⌈`n` ÷ 2⌉) of that band's levels that are not 0. A band with no sounding record has a median of 0. Leaving silent records out keeps a long silence from dragging the median to the floor.

**`overview`** is the whole stream in `B` = min(400, pair count) buckets, base64-encoded. Bucket `b` covers pairs ⌊`b` × `P` ÷ `B`⌋ up to, not including, the greater of ⌊(`b` + 1) × `P` ÷ `B`⌋ and its start plus one, where `P` is the pair count. Its byte is the decibel byte of the mean square over all of those pairs' samples, in the stream's mode. It is absolute: on the same scale as every other stream, never relative to the stream's loudest bucket.

## Sizes

| Layout        | Chunk    | Per minute | Per hour |
| ------------- | -------- | ---------- | -------- |
| With bands    | 30,720 B | 38,760 B   | 2.33 MB  |
| Without bands | 24,576 B | 31,008 B   | 1.86 MB  |

## Serving

The file is served as `application/octet-stream` under a name carrying a hash of its bytes, cached immutable. Never apply `Content-Encoding`: a range would then address compressed bytes. A response of 200 to a range request means the range was ignored, and the reader discards it.

## Using the fixtures

`fixtures/v2/` holds small streams in both modes and everything a correct writer makes of them.

- **`golden.json`** is the input and the expected results.
  - `sampleRate` and `sampleCount`: 44,100 and 2,348, which is nine full pairs and one of 44 samples, in two full records and one of 300 samples.
  - `stereo`: the source as runs. A run is `frames` copies of the 16-bit frame `(left, right)`.
  - `bands`: the band signals for each mode, as runs of 32-bit floats with full scale at 1.0. Average mode has one value per band; overall mode has a left and a right value per band. They start after the crossover, so the crossover is the one rule the fixtures cannot check.
  - `average` and `overall`: the expected `pairs` (minimum, maximum, RMS), the expected `levels` (low, mid, high) of each record, and the expected descriptor `facts`.
- **`average.wavedata`** and **`overall.wavedata`** are the files for that input.

To test a writer, expand the runs, feed them through the code that reduces frames to records, in chunks that split a frame down the middle if the writer streams, and compare the output with each file byte for byte. Then compare the descriptor facts.

Each pair is there to catch one mistake:

| Pair | `(L, R)` input | Average: min, max, RMS | Overall: min, max, RMS | Catches a writer that |
| --- | --- | --- | --- | --- |
| 0 | 16384, 16384 | 64, 64, 229 | 64, 64, 229 | Scales by 127, or writes linear RMS |
| 1 | −1, −2 | 0, 0, 1 | 0, 0, 1 | Floors the mix or the reduction (−1), or writes the floor as 0 |
| 2 | −300, −300 | −1, −1, 82 | −1, −1, 82 | Floors the reduction (−2), or truncates the RMS (81) |
| 3 | −32768, −32767 | −127, −127, 255 | −128, −127, 255 | Takes the overall minimum in average mode |
| 4 | 16384, −16384 | 0, 0, 0 | −64, 64, 229 | Mixes in overall mode, or lifts a cancelled mix off 0 |
| 5 | 8192, 8192 for 128 frames, then 0, 0 | 0, 32, 191 | 0, 32, 191 | Swaps the fields, or divides a part-silent pair wrongly |
| 6 | 0, 0 | 0, 0, 0 | 0, 0, 0 |  |
| 7 | 32767, 32767 | 127, 127, 255 | 127, 127, 255 | Lets full scale overflow |
| 8 | 8192, 4096 | 24, 24, 193 | 16, 32, 195 | Takes the RMS of the mix in overall mode |
| 9 | 8192, 8192 for 44 frames | 32, 32, 204 | 32, 32, 204 | Pads the short last pair, or divides it by 256 (171) |

The third record holds pairs 8 and 9 and two empty slots, which are zeros.

| Record | Low, mid, high input | Levels | Catches a writer that |
| --- | --- | --- | --- |
| 0 | 1, 0.1, 0 | 255, 170, 0 | Writes linear levels, or lifts silence off 0 |
| 1 | 2, 0.00001, 0.001 | 255, 1, 1 | Writes the floor as 0 |
| 2 | 0.1, 0.5, 0.25 for 300 samples | 170, 229, 204 | Truncates (203), or pads the short last record |

In overall mode both channels of a band carry the value shown, except the mid band of record 2, which is 0.5 on the left and 0 on the right. Its level is 217, which catches a writer that reads one channel (229) or none.

The expected `rmsRange` is `[82, 255]` in both modes: pair 1 sits at the floor and is left out, as the silent pairs are. The expected `medians` are `[255, 170, 1]`: the high band's silent record is left out, so its median is the lower of the two that remain. Ten pairs make ten overview buckets, so each bucket's byte is its pair's RMS byte.

The fixture files were assembled by hand from these tables, not by this package's writer. `validateWavedata` checks a finished file for structure: the header, the length, the order of each pair's minimum and maximum, and the empty slots. It passes a file whose values are scaled or rounded wrongly, which only the fixtures catch.
