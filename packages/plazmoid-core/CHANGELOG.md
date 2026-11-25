# @xsynaptic/plazmoid-core

## 0.5.0

### Minor Changes

- Add `PlayerUrls.tracks`, which resolves rows the page payload lacks. Detail is asked for only for the displayed and next tracks.

## 0.4.0

### Minor Changes

- Tracks carry their own `sources`, and `PlayerUrls.stream` is optional. `playTrack` takes one track and `queueTrack` is gone. Adds `bindPlaybackEvents`.

## 0.3.1

### Patch Changes

- Updated dependencies
  - @xsynaptic/plazmoid-wavedata@0.3.0

## 0.3.0

### Minor Changes

- `TrackDetail.waveform` carries the wavedata version 2 descriptor, overview included, replacing `peaks` and `waveformOverview`.

## 0.2.0

### Minor Changes

- Add `whenMediaElement`; the engine now exists by the time the loading state is published.

## 0.1.1

### Patch Changes

- Add `data-pzm-queue-tracks` and `data-pzm-play-from` page controls, with `queueTracks` and a start track on `playQueue`; `data-pzm-queue-track` on an empty queue now adds only its own track.

## 0.1.0

### Minor Changes

- First release
