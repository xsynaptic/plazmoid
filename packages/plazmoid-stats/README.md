# @xsynaptic/plazmoid-stats

Measures how much of a track was actually heard, from any media element. It has no dependencies and reads nothing but the element's events and clock.

```ts
import { monitorPlayback } from '@xsynaptic/plazmoid-stats';

const stop = monitorPlayback(element, {
	identify: () => currentTrackId(),
	minimumSeconds: 30,
	onReport: ({ heardSeconds, listenId, trackId }) => {
		navigator.sendBeacon('/api/listen', JSON.stringify({ heardSeconds, listenId, trackId }));
	},
});
```

A listen starts when a track plays and ends when it finishes or the source changes. Only time spent playing counts, so skipping ahead adds nothing.

Reports go out every so often while playing, and on pause, when the page is hidden and when it unloads. Each one carries the total so far for its `listenId`, so keep the highest you've seen and a lost or repeated report won't matter.

With `@xsynaptic/plazmoid-core`, the element is `store.getState().getMediaElement()`, which exists from the first play.
