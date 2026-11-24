# Plazmoid

An opinionated audio player for the web. It includes a queue, waveform views, and listening stats, all built from custom elements on [sonic-ui](https://github.com/xsynaptic/sonic-ui).

Plazmoid is made for a handful of specific sites so expect breaking changes before 1.0.

## Packages

- [`@xsynaptic/plazmoid-core`](packages/plazmoid-core): playback without an interface (the audio, the queue, saved state, lock screen controls and play buttons on the page)
- [`@xsynaptic/plazmoid-player`](packages/plazmoid-player): the player interface
- [`@xsynaptic/plazmoid-wavedata`](packages/plazmoid-wavedata): the waveform file format, with tools to write and read it
- [`@xsynaptic/plazmoid-stats`](packages/plazmoid-stats): measures how much of each track was actually heard

Encoding audio and extracting waveforms is left to each site.

## Development

```sh
pnpm install
pnpm check  # build, then run every check and the unit tests
pnpm fix    # autofix what it can, then check again
```

The player's end-to-end tests run in Chromium, Firefox and WebKit. No audio is committed, so the tests cut their fixtures with ffmpeg from a track you supply. Use real music at least eleven minutes long:

```sh
PZM_FIXTURE_SOURCE=/path/to/track.mp4 pnpm -F @xsynaptic/plazmoid-player test-e2e
```

## Releases

Add a changeset with `pnpm changeset` whenever a package changes. All four packages share one version.

```sh
pnpm version-packages  # apply changesets and write changelogs, then commit
pnpm release           # check, publish to npm, then push with tags
```

`pnpm release` only runs from an up-to-date `main` with nothing left uncommitted. `pnpm release --dry-run` stops after the checks.

## Licence

[MIT](LICENSE)
