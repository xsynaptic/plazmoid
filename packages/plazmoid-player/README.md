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

To keep the bar playing across page changes, put it in an element with `transition:persist` and use the helpers from `./astro`:

```ts
import { bindAstroRouter, loadPersistedStylesheet } from '@xsynaptic/plazmoid-player/astro';

await loadPersistedStylesheet(stylesheetUrl);

bindAstroRouter(view, bindPageControls(store, document));
```

The router drops any head stylesheet the next page doesn't link, so `loadPersistedStylesheet` carries the skin across. `bindAstroRouter` closes the full-screen view before a navigation and refreshes the page controls after it.

## Styling

The elements, the `pzm-*` classes and the `--pzm-*` custom properties are all public. `<pzm-root>` also reflects the player's state in `data-*` attributes, such as `data-status` and `data-paused`, for your own rules.

The skin assumes a CSS reset like Tailwind's preflight. Without one, the tray rows and the time display keep the browser's default button styling.

Some animations carry meaning, like the loading ring on the play button. While one runs, its element has `data-pzm-essential-motion`, so a global reduced-motion reset can leave it alone:

```css
@media (prefers-reduced-motion: reduce) {
	*:not([data-pzm-essential-motion])::after {
		animation-duration: 0.01ms !important;
	}
}
```
