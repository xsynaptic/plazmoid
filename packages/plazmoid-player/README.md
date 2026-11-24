# @xsynaptic/plazmoid-player

The interface for the Plazmoid audio player: a player bar with a queue tray, a waveform panel, a scope and a full-screen view on phones. It's built from light-DOM custom elements on [sonic-ui](https://www.npmjs.com/package/@xsynaptic/sonic-ui) controls, and comes with a dark skin. Playback is handled by [`@xsynaptic/plazmoid-core`](https://www.npmjs.com/package/@xsynaptic/plazmoid-core).

## Usage

Install this package along with its peer dependencies, `@xsynaptic/plazmoid-core` and `@xsynaptic/sonic-ui`.

```ts
import { createPlayerStore } from '@xsynaptic/plazmoid-core';
import { createPlayer, createViewStore } from '@xsynaptic/plazmoid-player';
import { defaultLabels } from '@xsynaptic/plazmoid-player/labels';

import '@xsynaptic/plazmoid-player/player.css';

const root = createPlayer({
	labels: { ...defaultLabels },
	store: createPlayerStore(),
	urls,
	view: createViewStore(),
});

document.body.append(root);
```

`createPlayer` returns a `<pzm-root>` holding the bar. Its options are read once, when the bar is first added to the page. Core's README covers `urls`, play buttons on the page and loading the player late.

`labels` is required, so a translated site doesn't ship the English strings. Spread `defaultLabels` and override what you need.

The main entry registers nothing on import and can't load in Node. `./define` registers the elements by side effect, so a bundler that ignores this package's `sideEffects` field will drop it. The queue tray, waveform panel, scope and full-screen view load the first time they open.

## Astro's client router

Render a persisted `data-pzm-host` element on every page and start the player from its script:

```astro
<div data-pzm-host transition:persist="player"></div>

<script>
	import { startAstroPlayer } from '@xsynaptic/plazmoid-player/astro';
	import { defaultLabels } from '@xsynaptic/plazmoid-player/labels';
	import stylesheetUrl from '@xsynaptic/plazmoid-player/player.css?url';

	startAstroPlayer(() => ({
		player: { labels: defaultLabels },
		stylesheetUrl,
		urls: () => urls,
	}));
</script>
```

`startAstroPlayer` calls your function once, on the first page with something to play, then loads the player on the first press or idle moment and replays any press made meanwhile. An optional `load()` runs beside the player's imports and resolves to `onPress` and `onReady` hooks; `urls` is called once it settles, and if it rejects the player starts without them.

## Styling

The elements, the `pzm-*` classes and the `--pzm-*` custom properties are all public. `<pzm-root>` also reflects the player's state in `data-*` attributes, such as `data-status` and `data-paused`, for your own rules.

Some animations carry meaning, like the loading ring on the play button. While one runs, its element has `data-pzm-essential-motion`, so a global reduced-motion reset can leave it alone:

```css
@media (prefers-reduced-motion: reduce) {
	*:not([data-pzm-essential-motion])::after {
		animation-duration: 0.01ms !important;
	}
}
```
