import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PageControls } from '#page-controls.ts';
import type { PlayerUrls, Track } from '#types.ts';

import { heldPressAttribute } from '#constants.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { bindPageControls } from '#page-controls.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { loadedTrack } from '#store/selectors.ts';
import { makeTrack } from '#test/player-store.ts';

let pageControls: PageControls | undefined;

const urls: PlayerUrls = {
	stream: ({ trackId }) =>
		Promise.resolve({ sources: [{ url: `https://api.test/${trackId}` }], status: 'ok' }),
};

afterEach(() => {
	vi.unstubAllGlobals();
	pageControls?.unbind();
	pageControls = undefined;
	document.body.replaceChildren();
});

function bindPage(
	tracks: Array<Track> | undefined,
	controls: string,
	resolveRows?: NonNullable<PlayerUrls['tracks']>,
) {
	const fake = createMockEngine();
	const store = createWritablePlayerStore({
		createEngine: fake.createEngine,
		storage: createMemoryStorage(),
	});

	const onPress = vi.fn();

	store.getState().configure({ urls: resolveRows ? { ...urls, tracks: resolveRows } : urls });
	document.body.innerHTML = `${tracks ? `<div data-pzm-payload='${JSON.stringify(tracks)}' hidden></div>` : ''}${controls}`;

	return {
		bind: ({ isReporting = true } = {}) => {
			pageControls = bindPageControls(store, document, isReporting ? { onPress } : {});
		},
		fake,
		onPress,
		store,
	};
}

function rowsOf(trackIds: ReadonlyArray<string>): Promise<Array<Track>> {
	return Promise.resolve(trackIds.map((trackId) => makeTrack(trackId)));
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function queuedIds(page: ReturnType<typeof bindPage>): Array<string> {
	return page.store.getState().queue.map((track) => track.trackId);
}

function element(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`Nothing matches ${selector}`);

	return found;
}

function cueList(mixId: string): string {
	return `<ol data-pzm-cue-track="${mixId}"><li data-pzm-cue-seconds="0"></li><li data-pzm-cue-seconds="60"></li></ol>`;
}

function currentCueRows(): Array<string> {
	return [...document.querySelectorAll<HTMLElement>('[data-pzm-cue-current]')].map(
		(row) =>
			`${String(row.closest('ol')?.dataset.pzmCueTrack)}@${String(row.dataset.pzmCueSeconds)}`,
	);
}

describe('bindPageControls', () => {
	test('replays the press held before the player loaded', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			`<button data-pzm-play-track="b" ${heldPressAttribute}></button>`,
		);

		page.bind();

		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(element('[data-pzm-play-track]').hasAttribute(heldPressAttribute)).toBe(false);
		expect(page.onPress).toHaveBeenCalledExactlyOnceWith({
			action: 'play-track',
			origin: 'page',
			trackId: 'b',
		});
	});

	test('a press lands for a host that passes no onPress', () => {
		const page = bindPage([makeTrack('a')], '<button data-pzm-play-track="a"></button>');

		page.bind({ isReporting: false });
		element('[data-pzm-play-track]').click();

		expect(loadedTrack(page.store.getState())?.trackId).toBe('a');
	});

	test('a track control beats the play-all wrapped around it, queueing only its own track', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<div data-pzm-play-tracks="a b"><button data-pzm-queue-track="b"></button></div>',
		);

		page.bind();
		element('[data-pzm-queue-track]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['b']);
		expect(loadedTrack(page.store.getState())).toBeUndefined();
	});

	test('a track press on an empty queue takes the whole payload and starts at the pressed track', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-track="b"></button>',
		);

		page.bind();
		element('[data-pzm-play-track]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a', 'b', 'c']);
		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
	});

	test('a track press on a running queue appends only the pressed track and plays it', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-track="c"></button>',
		);

		page.bind();
		page.store.getState().loadQueue([makeTrack('x')]);
		element('[data-pzm-play-track]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['x', 'c']);
		expect(loadedTrack(page.store.getState())?.trackId).toBe('c');
	});

	test('a track press on a queued track the payload lacks plays the queued copy, then toggles it', () => {
		const page = bindPage([makeTrack('a')], '<button data-pzm-play-track="b"></button>');

		page.bind();
		page.store.getState().loadQueue([makeTrack('a'), makeTrack('b')]);
		element('[data-pzm-play-track]').click();

		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(page.store.getState().isPaused).toBe(false);

		element('[data-pzm-play-track]').click();

		expect(page.store.getState().queue).toHaveLength(2);
		expect(page.store.getState().isPaused).toBe(true);
	});

	test('a track press on the loaded track reports the toggle, resuming only an entry that has played', () => {
		const page = bindPage([makeTrack('a')], '<button data-pzm-play-track="a"></button>');

		page.bind();
		element('[data-pzm-play-track]').click();
		page.fake.callbacks.current?.onStatus('playing');
		element('[data-pzm-play-track]').click();
		element('[data-pzm-play-track]').click();

		expect(page.onPress.mock.calls.map(([press]: Array<unknown>) => press)).toEqual([
			{ action: 'play-track', origin: 'page', trackId: 'a' },
			{ action: 'pause', origin: 'page', trackId: 'a' },
			{ action: 'play', isResume: true, origin: 'page', trackId: 'a' },
		]);
	});

	test('a throwing onPress is reported, and the press after it still arrives', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<button data-pzm-play-track="a"></button><button data-pzm-queue-track="b"></button>',
		);
		const reportError = vi.fn();

		vi.stubGlobal('reportError', reportError);
		page.onPress.mockImplementationOnce(() => {
			throw new Error('host fault');
		});
		page.bind();
		element('[data-pzm-play-track]').click();
		element('[data-pzm-queue-track]').click();

		expect(reportError).toHaveBeenCalledOnce();
		expect(page.onPress).toHaveBeenLastCalledWith({
			action: 'queue-track',
			origin: 'page',
			trackId: 'b',
		});
		expect(loadedTrack(page.store.getState())?.trackId).toBe('a');
	});

	test('a track press on an id neither the payload nor the queue holds changes nothing', () => {
		const page = bindPage([makeTrack('a')], '<button data-pzm-play-track="z"></button>');

		page.bind();
		page.store.getState().loadQueue([makeTrack('a')]);

		const { queue } = page.store.getState();

		element('[data-pzm-play-track]').click();

		expect(page.store.getState().queue).toBe(queue);
		expect(loadedTrack(page.store.getState())).toBeUndefined();
	});

	test('a page with no payload still toggles the loaded group and jumps to a queued track', () => {
		const page = bindPage(
			[],
			'<button data-pzm-play-tracks="a b"></button><button data-pzm-play-track="b"></button>',
		);

		document.querySelector('[data-pzm-payload]')?.remove();
		page.bind();
		page.store.getState().playQueue([makeTrack('a'), makeTrack('b')], 'a');
		element('[data-pzm-play-tracks]').click();

		expect(page.store.getState().isPaused).toBe(true);

		element('[data-pzm-play-track]').click();

		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(page.store.getState().queue).toHaveLength(2);
	});

	test('queues a group without playing, leaving the tracks already queued where they are', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-queue-tracks="a b c"></button>',
		);

		page.bind();
		page.store.getState().queueTracks([makeTrack('b')]);
		element('[data-pzm-queue-tracks]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['b', 'a', 'c']);
		expect(loadedTrack(page.store.getState())).toBeUndefined();
		expect(page.onPress).toHaveBeenCalledWith({
			action: 'queue-tracks',
			origin: 'page',
			trackIds: ['a', 'b', 'c'],
		});
	});

	test('replays a held group press as it would a track press', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			`<button data-pzm-queue-tracks="a b" ${heldPressAttribute}></button>`,
		);

		page.bind();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a', 'b']);
	});

	test('plays a group from its chosen track, reporting the group in order and the start beside it', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-tracks="a b c" data-pzm-play-from="b"></button>',
		);

		page.bind();
		page.store.getState().loadQueue([makeTrack('x')]);
		element('[data-pzm-play-tracks]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a', 'b', 'c']);
		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(page.onPress).toHaveBeenCalledWith({
			action: 'play-tracks',
			origin: 'page',
			trackId: 'b',
			trackIds: ['a', 'b', 'c'],
		});
	});

	test('a play-from control pauses only its own track, and jumps from any other track of the group', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-tracks="a b c" data-pzm-play-from="a" id="from-a"></button><button data-pzm-play-tracks="a b c" data-pzm-play-from="c" id="from-c"></button>',
		);

		page.bind();
		element('#from-a').click();

		expect(element('#from-a').dataset.pzmPlaying).toBe('');
		expect(element('#from-c').dataset.pzmPlaying).toBeUndefined();

		element('#from-c').click();

		expect(loadedTrack(page.store.getState())?.trackId).toBe('c');
		expect(page.store.getState().isPaused).toBe(false);
		expect(page.onPress).toHaveBeenLastCalledWith({
			action: 'play-tracks',
			origin: 'page',
			trackId: 'c',
			trackIds: ['a', 'b', 'c'],
		});

		element('#from-c').click();

		expect(page.store.getState().isPaused).toBe(true);
		expect(page.onPress).toHaveBeenLastCalledWith({
			action: 'pause',
			origin: 'page',
			trackId: 'c',
		});
	});

	test('refreshes the queue from the payload on binding and on a refresh', () => {
		const page = bindPage([{ ...makeTrack('a'), title: 'New' }], '');

		page.store.getState().loadQueue([{ ...makeTrack('a'), title: 'Old' }]);
		page.bind();

		expect(page.store.getState().queue[0]?.title).toBe('New');

		element('[data-pzm-payload]').dataset.pzmPayload = JSON.stringify([
			{ ...makeTrack('a'), title: 'Newer' },
		]);
		pageControls?.refresh();

		expect(page.store.getState().queue[0]?.title).toBe('Newer');
	});

	test('a payload that is not a list of tracks leaves a stored queue bound and queues nothing malformed', () => {
		const page = bindPage([], '<button data-pzm-play-track="b"></button>');

		page.store.getState().loadQueue([makeTrack('a')]);
		element('[data-pzm-payload]').dataset.pzmPayload = '{"tracks":[]}';

		expect(() => {
			page.bind();
		}).not.toThrow();

		element('[data-pzm-payload]').dataset.pzmPayload = JSON.stringify([
			{ trackId: 'b' },
			makeTrack('c'),
		]);
		pageControls?.refresh();
		element('[data-pzm-play-track]').click();

		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a']);
	});

	test('marks the loaded track on the page, and again after a refresh', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<button data-pzm-play-track="a"></button><div data-pzm-track-id="a"></div><div data-pzm-track-id="b"></div>',
		);

		page.bind();
		element('[data-pzm-play-track]').click();

		expect(element('[data-pzm-track-id="a"]').dataset.pzmPlaying).toBe('');
		expect(element('[data-pzm-track-id="b"]').dataset.pzmLoaded).toBeUndefined();

		element('[data-pzm-track-id="a"]').remove();
		document.body.insertAdjacentHTML('beforeend', '<div data-pzm-track-id="a" id="swapped"></div>');
		pageControls?.refresh();

		expect(element('#swapped').dataset.pzmLoaded).toBe('');

		page.store.getState().togglePaused();

		expect(element('#swapped').dataset.pzmPlaying).toBeUndefined();
	});

	test("marks the current cue only in the loaded track's cue list", () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			`<button data-pzm-play-track="a"></button>${cueList('a')}${cueList('b')}`,
		);

		page.bind();
		element('[data-pzm-play-track]').click();
		page.store.setState({
			details: new Map([
				[
					'a',
					{
						cuePoints: [
							{ artistLine: '', startSeconds: 0, title: 'Opening' },
							{ artistLine: '', startSeconds: 60, title: 'Second' },
						],
					},
				],
			]),
		});
		page.fake.callbacks.current?.onTime(90);

		expect(currentCueRows()).toEqual(['a@60']);

		page.fake.callbacks.current?.onTime(30);

		expect(currentCueRows()).toEqual(['a@0']);
	});

	test('leaves the page alone once unbound', () => {
		const page = bindPage([makeTrack('a')], '<button data-pzm-play-track="a"></button>');

		page.bind();
		pageControls?.unbind();
		element('[data-pzm-play-track]').click();

		expect(loadedTrack(page.store.getState())).toBeUndefined();
	});

	test('reports a group of tracks in the order it queued, so the first id is what starts', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-tracks="c a"></button>',
		);

		page.bind();
		element('[data-pzm-play-tracks]').click();

		expect(page.onPress).toHaveBeenCalledWith({
			action: 'play-tracks',
			origin: 'page',
			trackId: 'c',
			trackIds: ['c', 'a'],
		});
	});

	test('a press on the group tuned in pauses and resumes in place', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b'), makeTrack('c')],
			'<button data-pzm-play-tracks="b c"></button>',
		);

		page.bind();
		page.store.getState().playQueue([makeTrack('a'), makeTrack('b')], 'b');
		page.store.getState().seek(120);
		element('[data-pzm-play-tracks]').click();

		expect(page.store.getState().isPaused).toBe(true);
		expect(page.store.getState().queue.map((track) => track.trackId)).toEqual(['a', 'b']);
		expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		expect(page.store.getState().currentTimeSeconds).toBe(120);
		expect(page.onPress).toHaveBeenCalledWith({ action: 'pause', origin: 'page', trackId: 'b' });

		element('[data-pzm-play-tracks]').click();

		expect(page.store.getState().isPaused).toBe(false);
		expect(page.onPress).toHaveBeenLastCalledWith({
			action: 'play',
			isResume: false,
			origin: 'page',
			trackId: 'b',
		});
		expect(page.store.getState().currentTimeSeconds).toBe(120);
	});

	test('marks every group holding the loaded track while it plays', () => {
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<button data-pzm-play-tracks="a b" id="first"></button><button data-pzm-play-tracks="b" id="second"></button>',
		);

		page.bind();
		element('#first').click();

		expect(element('#first').dataset.pzmPlaying).toBe('');
		expect(element('#second').dataset.pzmPlaying).toBeUndefined();

		page.store.getState().next();

		expect(element('#first').dataset.pzmPlaying).toBe('');
		expect(element('#second').dataset.pzmPlaying).toBe('');

		page.store.getState().togglePaused();

		expect(element('#first').dataset.pzmPlaying).toBeUndefined();
		expect(element('#second').dataset.pzmPlaying).toBeUndefined();
	});

	test('marks the queued track and disables the button that adds it', () => {
		const page = bindPage(
			[makeTrack('a')],
			'<div data-pzm-track-id="a"><button data-pzm-queue-track="a"></button></div>',
		);

		page.bind();

		expect(element('[data-pzm-track-id="a"]').dataset.pzmQueued).toBeUndefined();
		expect(element('[data-pzm-queue-track]').hasAttribute('disabled')).toBe(false);

		element('[data-pzm-queue-track]').click();

		expect(element('[data-pzm-track-id="a"]').dataset.pzmQueued).toBe('');
		expect(element('[data-pzm-queue-track]').hasAttribute('disabled')).toBe(true);
	});
});

describe('rows the payload lacks', () => {
	test('a page that ships controls alone plays the rows the host resolves, and reports the press once they land', async () => {
		const resolveRows = vi.fn(rowsOf);
		const page = bindPage(
			undefined,
			'<button data-pzm-play-tracks="a b c" data-pzm-play-from="b"></button>',
			resolveRows,
		);

		page.bind();
		element('[data-pzm-play-tracks]').click();

		expect(queuedIds(page)).toEqual([]);
		expect(page.onPress).not.toHaveBeenCalled();

		await vi.waitFor(() => {
			expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		});
		expect(queuedIds(page)).toEqual(['a', 'b', 'c']);
		expect(resolveRows).toHaveBeenCalledExactlyOnceWith(['a', 'b', 'c']);
		expect(page.onPress).toHaveBeenCalledExactlyOnceWith({
			action: 'play-tracks',
			origin: 'page',
			trackId: 'b',
			trackIds: ['a', 'b', 'c'],
		});
	});

	test('a track press on an empty queue with no payload plays the named track alone', async () => {
		const resolveRows = vi.fn(rowsOf);
		const page = bindPage(undefined, '<button data-pzm-play-track="b"></button>', resolveRows);

		page.bind();
		element('[data-pzm-play-track]').click();

		await vi.waitFor(() => {
			expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		});
		expect(queuedIds(page)).toEqual(['b']);
		expect(resolveRows).toHaveBeenCalledExactlyOnceWith(['b']);
	});

	test('a payload row is used without asking the host, which is asked only for the rest', async () => {
		const resolveRows = vi.fn(rowsOf);
		const page = bindPage(
			[makeTrack('a'), makeTrack('b')],
			'<button data-pzm-play-tracks="a b" id="embedded"></button><button data-pzm-queue-tracks="a c" id="mixed"></button>',
			resolveRows,
		);

		page.bind();
		element('#embedded').click();

		expect(queuedIds(page)).toEqual(['a', 'b']);
		expect(resolveRows).not.toHaveBeenCalled();

		element('#mixed').click();

		await vi.waitFor(() => {
			expect(queuedIds(page)).toEqual(['a', 'b', 'c']);
		});
		expect(resolveRows).toHaveBeenCalledExactlyOnceWith(['c']);
	});

	test('a resolved row that fails the track check is dropped from the press', async () => {
		const page = bindPage(undefined, '<button data-pzm-queue-tracks="a b"></button>', () =>
			Promise.resolve([{ trackId: 'a' } as unknown as Track, makeTrack('b')]),
		);

		page.bind();
		element('[data-pzm-queue-tracks]').click();

		await vi.waitFor(() => {
			expect(page.onPress).toHaveBeenCalledWith({
				action: 'queue-tracks',
				origin: 'page',
				trackIds: ['b'],
			});
		});
		expect(queuedIds(page)).toEqual(['b']);
	});

	test('a slow resolve that lands after a newer press leaves the newer choice', async () => {
		const answers = new Map<string, PromiseWithResolvers<Array<Track>>>();
		const page = bindPage(
			undefined,
			'<button data-pzm-play-tracks="a" id="first"></button><button data-pzm-play-tracks="b" id="second"></button>',
			(trackIds) => {
				const answer = Promise.withResolvers<Array<Track>>();

				answers.set(trackIds.join(' '), answer);

				return answer.promise;
			},
		);

		page.bind();
		element('#first').click();
		element('#second').click();
		answers.get('b')?.resolve([makeTrack('b')]);

		await vi.waitFor(() => {
			expect(loadedTrack(page.store.getState())?.trackId).toBe('b');
		});

		answers.get('a')?.resolve([makeTrack('a')]);
		await settle();

		expect(queuedIds(page)).toEqual(['b']);
		expect(page.onPress).toHaveBeenCalledExactlyOnceWith({
			action: 'play-tracks',
			origin: 'page',
			trackId: 'b',
			trackIds: ['b'],
		});
	});

	test('a rejected resolve leaves the queue and position untouched, and the control pressable', async () => {
		let isOnline = false;
		const page = bindPage(undefined, '<button data-pzm-play-tracks="a b"></button>', (trackIds) =>
			isOnline ? rowsOf(trackIds) : Promise.reject(new Error('offline')),
		);

		page.bind();
		page.store.getState().playQueue([makeTrack('x'), makeTrack('y')], 'y');
		page.store.getState().seek(42);

		const { queue } = page.store.getState();

		element('[data-pzm-play-tracks]').click();
		await settle();

		expect(page.store.getState().queue).toBe(queue);
		expect(loadedTrack(page.store.getState())?.trackId).toBe('y');
		expect(page.store.getState().currentTimeSeconds).toBe(42);
		expect(page.onPress).not.toHaveBeenCalled();

		isOnline = true;
		element('[data-pzm-play-tracks]').click();

		await vi.waitFor(() => {
			expect(queuedIds(page)).toEqual(['a', 'b']);
		});
	});

	test('a press still resolving when the controls unbind lands nothing', async () => {
		const answer = Promise.withResolvers<Array<Track>>();
		const page = bindPage(
			undefined,
			'<button data-pzm-queue-track="a"></button>',
			() => answer.promise,
		);

		page.bind();
		element('[data-pzm-queue-track]').click();
		pageControls?.unbind();
		answer.resolve([makeTrack('a')]);
		await settle();

		expect(queuedIds(page)).toEqual([]);
	});
});
