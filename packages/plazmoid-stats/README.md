# @xsynaptic/plazmoid-stats

Measures how much of a track was actually heard, from any media element. It has no dependencies and reads nothing but the element's events and clock.

```ts
import { monitorPlayback } from '@xsynaptic/plazmoid-stats';

const stop = monitorPlayback(element, {
	identify: () => currentTrackId(),
	minimumSeconds: 30,
	onReport: (report) => {
		navigator.sendBeacon('/api/listen', JSON.stringify(report));
	},
});
```

A listen starts when a track plays and ends when it finishes or the source changes. Only time spent playing counts, so skipping ahead adds nothing. A listen reports once `minimumSeconds` are heard, or all but the last second of a shorter track.

Reports go out every so often while playing, and on pause, when the page is hidden and when it unloads. Each one carries the total so far for its `listenId`, so keep the highest you've seen and a lost or repeated report won't matter.

With `@xsynaptic/plazmoid-core`, `whenMediaElement(store)` resolves with the element once the first play creates it.

## The server's side

A report is `{ durationSeconds?, heardSeconds, listenId, trackId }`, in whole seconds. A server counting plays should hold to:

- `heardSeconds` of at least 1
- A play once `heardSeconds >= min(minimumSeconds, durationSeconds - 1)`, with your catalogue's duration where you have one
- A first report of at most `reportEverySeconds` (or `minimumSeconds`, if larger) plus slack, with the listen's start dated back by it; a later report keeps the highest total, never past the time since that start
- A `listenId` bound to the `trackId` it first arrived with

Caps, storage and how a visitor is identified are yours.
