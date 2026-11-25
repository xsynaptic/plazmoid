# @xsynaptic/plazmoid-core

Playback for the Plazmoid audio player, with no interface of its own. It plays audio through a single media element and handles the queue, saving it between visits, lock screen controls and play buttons on the page. The interface is [`@xsynaptic/plazmoid-player`](https://www.npmjs.com/package/@xsynaptic/plazmoid-player).

## Usage

```ts
import { bindMediaSession, bindPageControls, createPlayerStore } from '@xsynaptic/plazmoid-core';

const store = createPlayerStore();

store.getState().configure({
	urls: {
		detail: (track) => fetchDetail(track),
	},
});

bindPageControls(store, document);
bindMediaSession(store);
```

`createPlayerStore` returns a zustand store and restores any saved queue, paused where the listener left off. Read it with `getState()` and `subscribe()`, and change playback through its actions. A second player on the same page should pass `storage: createMemoryStorage()`, so it doesn't show or overwrite the listener's queue.

A track lists its audio in `sources`, in order of preference, and the player loads the first one the browser can play. Nothing plays until `configure` sets `urls`, even to `{}`. `urls.stream` resolves the sources at play time instead, for a URL that has to be signed; `urls.detail` returns a track's cue points and waveform. Extra fields on a track are kept, through storage too, and passed back to both.

`bindPlaybackEvents(store, listener)` reports playback health: `failed` and `diagnostic`. What the listener does arrives through the `onPress` option of `bindPageControls` and `bindMediaSession`. A listener that throws goes to `reportError`.

The media element is never added to the document, and it requests audio with `crossOrigin = 'anonymous'`, so the server hosting your audio needs to send CORS headers.

## Page controls

`bindPageControls` adds one click listener to the document, so play buttons work without any script on the page. List the page's tracks once in a payload and refer to them by id:

```html
<div
	data-pzm-payload='[{"trackId":"one","title":"…","artistLine":"…","releaseTitle":"…"}]'
	hidden
></div>

<div data-pzm-track-id="one">
	<button data-pzm-play-track="one" type="button">Play</button>
	<button data-pzm-queue-track="one" type="button">Queue</button>
</div>
<button data-pzm-play-tracks="one two" type="button">Play all</button>
<button data-pzm-play-tracks="one two" data-pzm-play-from="two" type="button">Play from two</button>
```

`data-pzm-play-track` plays a track, `data-pzm-queue-track` adds it without playing, `data-pzm-play-tracks` replaces the queue with a list of ids and `data-pzm-queue-tracks` adds them. `data-pzm-play-from` beside `data-pzm-play-tracks` names the id to start at. A row marked with `data-pzm-track-id` gets `data-pzm-loaded`, `data-pzm-playing` and `data-pzm-queued` as its track changes state, so you can style it. Cue point lists work the same way, with `data-pzm-cue-track` on the list and `data-pzm-cue-seconds` on each row.

A control whose ids the payload lacks asks `urls.tracks(trackIds)` for their rows, so a page can ship controls with no payload. `urls.tracks` also refreshes a queue restored from storage. Detail is only asked for the displayed track and the next one.

After a client-side navigation, call `refresh()` on the controls `bindPageControls` returns.

## Loading the player late

`./boot` is small enough for a page's eager script. It holds on to presses while the rest of the player loads:

```ts
import { holdPresses, isPlayerActionable } from '@xsynaptic/plazmoid-core/boot';

if (isPlayerActionable(document)) {
	const presses = holdPresses(document);
	const { bindPageControls, createPlayerStore } = await import('@xsynaptic/plazmoid-core');
	const store = createPlayerStore();

	bindPageControls(store, document);
	presses.release();
}
```

The press is replayed once the controls are bound, so call `release()` after `bindPageControls`.
