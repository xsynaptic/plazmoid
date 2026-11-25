import type { PlayerStore, PlayerStoreApi } from '#store/player-types.ts';
import type { Track } from '#types.ts';

import {
	controlSelector,
	cueCurrentAttribute,
	cueSecondsAttribute,
	cueTrackAttribute,
	heldPressAttribute,
	heldPressSelector,
	loadedAttribute,
	payloadAttribute,
	payloadSelector,
	playFromAttribute,
	playingAttribute,
	playTrackAttribute,
	playTracksAttribute,
	queuedAttribute,
	queueTrackAttribute,
	queueTracksAttribute,
	trackIdAttribute,
} from '#constants.ts';
import { bind } from '#lib/bind.ts';
import { resolveTracks } from '#store/resolve-tracks.ts';
import { currentCue, loadedTrack } from '#store/selectors.ts';
import { toStoredTrack } from '#store/stored-shapes.ts';

// The resolved press, so a host reads the verb rather than re-deriving it from the DOM
export interface ControlPress {
	startTrackId?: string;
	trackIds: Array<string>;
	verb: 'play-track' | 'play-tracks' | 'queue-track' | 'queue-tracks' | 'toggle-tracks';
}

export interface PageControls {
	refresh: () => void;
	unbind: () => void;
}

interface PageControlOptions {
	onPress?: ((press: ControlPress) => void) | undefined;
}

interface RowPress {
	land: (state: PlayerStore, tracks: Array<Track>) => ControlPress;
	trackIds: ReadonlyArray<string>;
}

interface RowState {
	cueStartSeconds: number | undefined;
	isPlaying: boolean;
	queuedIds: string;
	trackId: string | undefined;
}

// One delegated listener, so pages ship no player script and survive the client router's scripts-run-once model
export function bindPageControls(
	store: PlayerStoreApi,
	page: Document,
	{ onPress }: PageControlOptions = {},
): PageControls {
	const connection = new AbortController();
	const { signal } = connection;
	const readPayload = payloadReader(page);
	const selectRowState = rowStateSelector();

	let latestPress = 0;

	const land = (press: RowPress, tracks: Array<Track>): void => {
		const landed = press.land(store.getState(), tracks);

		onPress?.(landed);
	};

	const landResolved = async (
		press: RowPress,
		payload: Array<Track>,
		resolving: Promise<Array<Track>>,
	): Promise<void> => {
		const pressNumber = latestPress;
		let resolved: Array<Track>;

		try {
			resolved = await resolving;
		} catch {
			return;
		}

		if (pressNumber !== latestPress || signal.aborted) return;

		land(press, tracksWithIds(press.trackIds, [...payload, ...resolved]));
	};

	const gather = (press: RowPress, payload: Array<Track>): void => {
		const missingIds = idsMissingFrom(press.trackIds, payload);
		const resolve = store.getState().urls?.tracks;

		// Stays synchronous when the payload holds every row, so playback starts inside the click
		if (!resolve || missingIds.length === 0) {
			land(press, tracksWithIds(press.trackIds, payload));
			return;
		}

		void landResolved(press, payload, resolveTracks(resolve, missingIds));
	};

	const dispatchControl = (target: Element | undefined): void => {
		const control = target?.closest(controlSelector);
		if (!control) return;

		latestPress += 1;

		// A page without a payload can still pause or jump to what is queued
		const payload = readPayload() ?? [];
		const press = pressControl(store.getState(), control, payload);
		if (!press) return;

		if ('land' in press) {
			gather(press, payload);
			return;
		}

		onPress?.(press);
	};

	// A queue restored from storage can predate this build; a press on a track already queued jumps to the stored copy
	const refreshQueue = (): void => {
		const tracks = readPayload();
		if (tracks) store.getState().refreshQueue(tracks);
	};

	refreshQueue();
	bind(
		store,
		selectRowState,
		(rowState) => {
			markRows(page, rowState);
		},
		signal,
	);
	page.addEventListener(
		'click',
		(event) => {
			dispatchControl(event.target instanceof Element ? event.target : undefined);
		},
		{ signal },
	);

	const held = page.querySelector(heldPressSelector);

	held?.removeAttribute(heldPressAttribute);
	dispatchControl(held ?? undefined);

	return {
		refresh: () => {
			refreshQueue();
			markRows(page, selectRowState(store.getState()));
		},
		unbind: () => {
			connection.abort();
		},
	};
}

function attribute(element: Element, name: string): string | undefined {
	return element.getAttribute(name) ?? undefined;
}

function idsMissingFrom(
	trackIds: ReadonlyArray<string>,
	tracks: ReadonlyArray<Track>,
): Array<string> {
	return [...new Set(trackIds)].filter((trackId) => !trackWithId(trackId, tracks));
}

function isGroupLoaded(control: Element, trackId: string | undefined): boolean {
	if (trackId === undefined) return false;

	const playFrom = attribute(control, playFromAttribute);
	if (playFrom !== undefined) return playFrom === trackId;

	return groupIds(control).includes(trackId);
}

function groupIds(control: Element): Array<string> {
	return (attribute(control, playTracksAttribute) ?? '').split(' ');
}

function markCueRows(page: Document, { cueStartSeconds, trackId }: RowState): void {
	for (const list of page.querySelectorAll(`[${CSS.escape(cueTrackAttribute)}]`)) {
		const isLoaded = trackId !== undefined && attribute(list, cueTrackAttribute) === trackId;

		for (const row of list.querySelectorAll(`[${CSS.escape(cueSecondsAttribute)}]`)) {
			row.toggleAttribute(
				cueCurrentAttribute,
				isLoaded && Number(attribute(row, cueSecondsAttribute)) === cueStartSeconds,
			);
		}
	}
}

function markTrackGroups(page: Document, { isPlaying, trackId }: RowState): void {
	for (const group of page.querySelectorAll(`[${CSS.escape(playTracksAttribute)}]`)) {
		group.toggleAttribute(playingAttribute, isPlaying && isGroupLoaded(group, trackId));
	}
}

function markRows(page: Document, state: RowState): void {
	markTrackRows(page, state);
	markCueRows(page, state);
	markTrackGroups(page, state);
}

function markTrackRows(page: Document, { isPlaying, queuedIds, trackId }: RowState): void {
	const queued = new Set(queuedIds.split(' '));

	for (const row of page.querySelectorAll(`[${CSS.escape(trackIdAttribute)}]`)) {
		const rowTrackId = attribute(row, trackIdAttribute);
		const isLoaded = trackId !== undefined && rowTrackId === trackId;
		const isQueued = rowTrackId !== undefined && queued.has(rowTrackId);

		row.toggleAttribute(loadedAttribute, isLoaded);
		row.toggleAttribute(playingAttribute, isLoaded && isPlaying);
		row.toggleAttribute(queuedAttribute, isQueued);

		// The verb only adds, so a queued track leaves the button nothing to do
		for (const button of row.querySelectorAll<HTMLButtonElement>(
			`[${CSS.escape(queueTrackAttribute)}]`,
		)) {
			button.disabled = isQueued;
		}
	}
}

// Parsed once per payload rather than once per click; the string changes with each soft navigation
function payloadReader(page: Document): () => Array<Track> | undefined {
	let parsedSource: string | undefined;
	let parsedTracks: Array<Track> | undefined;

	return () => {
		const payload = page.querySelector(payloadSelector)?.getAttribute(payloadAttribute);
		if (!payload) return;
		if (payload === parsedSource) return parsedTracks;

		parsedSource = payload;

		parsedTracks = parsePayload(payload);

		return parsedTracks;
	};
}

// Checked as a stored track is, since a page from a newer build can land under this one's modules
function parsePayload(payload: string): Array<Track> | undefined {
	let parsed: unknown;

	try {
		parsed = JSON.parse(payload);
	} catch {
		return undefined;
	}

	if (!Array.isArray(parsed)) return undefined;

	return parsed.map((entry) => toStoredTrack(entry)).filter((track) => track !== undefined);
}

function tracksWithIds(ids: ReadonlyArray<string>, tracks: ReadonlyArray<Track>): Array<Track> {
	return ids.map((trackId) => trackWithId(trackId, tracks)).filter((track) => track !== undefined);
}

function trackWithId(trackId: string, tracks: ReadonlyArray<Track>): Track | undefined {
	return tracks.find((track) => track.trackId === trackId);
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function pressControl(
	state: PlayerStore,
	control: Element,
	payload: Array<Track>,
): ControlPress | RowPress | undefined {
	if (control.hasAttribute(playTracksAttribute)) return pressGroup(state, control);

	const queueTracks = attribute(control, queueTracksAttribute);

	if (queueTracks !== undefined) {
		return {
			land: (latest, group) => {
				latest.queueTracks(group);

				return { trackIds: group.map((track) => track.trackId), verb: 'queue-tracks' };
			},
			trackIds: queueTracks.split(' '),
		};
	}

	const queueTrack = attribute(control, queueTrackAttribute);

	if (queueTrack) {
		return {
			land: (latest, tracks) => {
				latest.queueTracks(tracks);

				return { trackIds: [queueTrack], verb: 'queue-track' };
			},
			trackIds: [queueTrack],
		};
	}

	const playTrack = attribute(control, playTrackAttribute);
	if (!playTrack) return undefined;

	return pressTrack(state, playTrack, payload);
}

function pressGroup(state: PlayerStore, control: Element): ControlPress | RowPress {
	if (isGroupLoaded(control, loadedTrack(state)?.trackId)) {
		state.togglePaused();

		return { trackIds: groupIds(control), verb: 'toggle-tracks' };
	}

	const playFrom = attribute(control, playFromAttribute);

	return {
		land: (latest, group) => {
			const trackIds = group.map((track) => track.trackId);

			latest.playQueue(group, playFrom);

			if (playFrom === undefined) return { trackIds, verb: 'play-tracks' };

			return { startTrackId: playFrom, trackIds, verb: 'play-tracks' };
		},
		trackIds: groupIds(control),
	};
}

function pressTrack(
	state: PlayerStore,
	trackId: string,
	payload: Array<Track>,
): ControlPress | RowPress {
	const press: ControlPress = { trackIds: [trackId], verb: 'play-track' };
	const isInPayload = trackWithId(trackId, payload) !== undefined;

	// An empty queue takes the whole payload, so the rest of the release follows the pressed track
	if (state.queue.length === 0) {
		return {
			land: (latest, tracks) => {
				latest.playQueue(tracks, trackId);

				return press;
			},
			trackIds: isInPayload ? payload.map((track) => track.trackId) : [trackId],
		};
	}

	// The queue is the store's, so a queued track still plays when the payload lacks it
	const queued = isInPayload ? undefined : trackWithId(trackId, state.queue);

	if (queued) {
		state.playTrack(queued);

		return press;
	}

	return {
		land: (latest, [track]) => {
			if (track) latest.playTrack(track);

			return press;
		},
		trackIds: [trackId],
	};
}

function rowStateSelector(): (state: PlayerStore) => RowState {
	let joinedQueue: PlayerStore['queue'] | undefined;
	let queuedIds = '';

	return (state) => {
		if (state.queue !== joinedQueue) {
			joinedQueue = state.queue;
			queuedIds = state.queue.map((track) => track.trackId).join(' ');
		}

		return {
			cueStartSeconds: currentCue(state)?.startSeconds,
			// Intent rather than sound, matching the bar's play button
			isPlaying: !state.isPaused,
			queuedIds,
			trackId: loadedTrack(state)?.trackId,
		};
	};
}
