# @xsynaptic/plazmoid-player

## 0.3.0

### Minor Changes

- Reads wavedata version 2 in one range per chunk and draws the overview from its absolute levels; version 1 is no longer read.

## 0.2.0

### Minor Changes

- Add `startAstroPlayer` to `./astro`, which mounts the player into `[data-pzm-host]`; `bindAstroRouter` and `loadPersistedStylesheet` are no longer exported.
- The panel's waveform zooms with a plain mouse wheel, not only a ctrl or cmd wheel. Needs `@xsynaptic/sonic-ui` 0.32.

## 0.1.1

### Patch Changes

- The skin resets its own buttons, paragraphs and lists, so it no longer needs a host reset.

## 0.1.0

### Minor Changes

- First release
