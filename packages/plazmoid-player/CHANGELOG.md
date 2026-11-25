# @xsynaptic/plazmoid-player

## 0.4.1

### Patch Changes

- Document `urls.tracks` and pages that ship controls with no payload.
- Updated dependencies
  - @xsynaptic/plazmoid-core@0.5.0

## 0.4.0

### Minor Changes

- `createPlayer` no longer takes `urls` or `seekSeconds`; configure the store instead. `startAstroPlayer`'s function receives the host's JSON script and can return `seekSeconds`, and its hooks gain `onEvent`.

### Patch Changes

- If the scope fails to load, it now switches off and reports the error once instead of retrying on every resize; pressing it tries again. Turning the scope off also stops it straight away when the skin has no fade-out transition.
- Updated dependencies
  - @xsynaptic/plazmoid-core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies
  - @xsynaptic/plazmoid-wavedata@0.3.0

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
