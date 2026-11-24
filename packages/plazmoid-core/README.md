# @xsynaptic/plazmoid-core

Playback for the Plazmoid audio player, with no interface of its own. It plays audio through a single media element and handles the queue, saving it between visits, lock screen controls and play buttons on the page. The interface is [`@xsynaptic/plazmoid-player`](https://www.npmjs.com/package/@xsynaptic/plazmoid-player).

## Usage

```ts
import { bindMediaSession, bindPageControls, createPlayerStore } from '@xsynaptic/plazmoid-core';

const store = createPlayerStore();

store.getState().configure({
	urls: {
		detail: (track) => fetchDetail(track),
		stream: (track) =>
			Promise.resolve({
				sources: [{ type: 'audio/mp4; codecs="Opus"', url: streamUrlOf(track) }],
				status: 'ok',
			}),
	},
});

bindPageControls(store, document);
bindMediaSession(store);
```

`createPlayerStore` returns a zustand store and restores any saved queue, paused where the listener left off. Read it with `getState()` and `subscribe()`, and change playback through its actions. If you mount the interface, `createPlayer` calls `configure` for you. A second player on the same page should pass `storage: createMemoryStorage()`, so it doesn't show or overwrite the listener's queue.

`stream` returns sources in order of preference, and the player loads the first one the browser can play. `detail` is optional and returns a track's cue points and waveform. Any extra fields you put on a track are kept, through storage too, and come back to both.

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
```

`data-pzm-play-track` plays a track, `data-pzm-queue-track` adds it without playing, and `data-pzm-play-tracks` replaces the queue with a list of ids. A row marked with `data-pzm-track-id` gets `data-pzm-loaded`, `data-pzm-playing` and `data-pzm-queued` as its track changes state, so you can style it. Cue point lists work the same way, with `data-pzm-cue-track` on the list and `data-pzm-cue-seconds` on each row.

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
