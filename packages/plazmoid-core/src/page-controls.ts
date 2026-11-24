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

	const dispatchControl = (target: Element | undefined): void => {
		const control = target?.closest(controlSelector);
		const tracks = control ? readPayload() : undefined;
		if (!control || !tracks) return;

		const press = pressControl(store.getState(), control, tracks);

		if (press) onPress?.(press);
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
	return ids
		.map((trackId) => tracks.find((track) => track.trackId === trackId))
		.filter((track) => track !== undefined);
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function pressControl(
	state: PlayerStore,
	control: Element,
	tracks: Array<Track>,
): ControlPress | undefined {
	if (control.hasAttribute(playTracksAttribute)) return pressGroup(state, control, tracks);

	const queueTracks = attribute(control, queueTracksAttribute);

	if (queueTracks !== undefined) {
		const group = tracksWithIds(queueTracks.split(' '), tracks);

		state.queueTracks(group);

		return { trackIds: group.map((track) => track.trackId), verb: 'queue-tracks' };
	}

	const queueTrack = attribute(control, queueTrackAttribute);

	if (queueTrack) {
		state.queueTrack(tracks, queueTrack);

		return { trackIds: [queueTrack], verb: 'queue-track' };
	}

	const playTrack = attribute(control, playTrackAttribute);
	if (!playTrack) return undefined;

	state.playTrack(tracks, playTrack);

	return { trackIds: [playTrack], verb: 'play-track' };
}

function pressGroup(state: PlayerStore, control: Element, tracks: Array<Track>): ControlPress {
	if (isGroupLoaded(control, loadedTrack(state)?.trackId)) {
		state.togglePaused();

		return { trackIds: groupIds(control), verb: 'toggle-tracks' };
	}

	const group = tracksWithIds(groupIds(control), tracks);
	const trackIds = group.map((track) => track.trackId);
	const playFrom = attribute(control, playFromAttribute);

	state.playQueue(group, playFrom);

	if (playFrom === undefined) return { trackIds, verb: 'play-tracks' };

	return { startTrackId: playFrom, trackIds, verb: 'play-tracks' };
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
