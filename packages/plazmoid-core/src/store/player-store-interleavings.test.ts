import type { StoreApi } from 'zustand/vanilla';

import { fc } from '@fast-check/vitest';
import { expect, test, vi } from 'vitest';

import type { AudioEngine, AudioEngineCallbacks } from '#engine/audio-engine.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlaybackErrorStage, StreamResolution, Track } from '#types.ts';

import { createMemoryStorage } from '#lib/storage.ts';
import { isTerminalStatus } from '#store/playback-controller.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { loadedTrack } from '#store/selectors.ts';
import { makeTrack } from '#test/player-store.ts';

type Answer = keyof typeof resolutions;

interface ElementDouble {
	callbacks?: AudioEngineCallbacks;
	// A media error aborts the fetch, so a source fails at most once until the next `load()`
	hasFailed: boolean;
	isPlaying: boolean;
	src: string | undefined;
	wantsPlay: boolean;
}

interface Session {
	answerOf: (call: number) => Answer;
	calls: number;
	element: ElementDouble;
	emit: () => AudioEngineCallbacks;
	mostRetriesInChain: number;
	retriesInChain: number;
	scheduler: fc.Scheduler;
	step: Step | undefined;
	store: StoreApi<PlayerStore>;
	tally: Tally;
}

interface Step {
	at: number;
	kind: StepKind;
	stage: Exclude<PlaybackErrorStage, 'resolve'>;
	to: number;
}

type StepKind = keyof typeof stepActions;

interface Tally {
	errorsShown: number;
	retries: number;
	settledPaused: number;
	settledPlaying: number;
	staleAnswers: number;
	terminalHeld: number;
	unplayable: number;
}

const catalog = ['a', 'b', 'c', 'd'].map(makeTrack);
const release = catalog.slice(0, 3);
const declinedType = 'audio/x-declined';

const resolutions = {
	capped: () => Promise.resolve({ status: 'capped' }),
	declined: (url) => Promise.resolve({ sources: [{ type: declinedType, url }], status: 'ok' }),
	empty: () => Promise.resolve({ sources: [], status: 'ok' }),
	ok: (url) => Promise.resolve({ sources: [{ url }], status: 'ok' }),
	reject: () => Promise.reject(new Error('The resolver is down')),
} satisfies Record<string, (url: string) => Promise<StreamResolution>>;

const stepActions = {
	clear: ({ store }) => {
		store.getState().clearQueue();
	},
	// The spec fires `pause` and then `ended` in one task
	'element-ends': ({ element, emit }) => {
		if (!element.isPlaying) return;

		stopElement(element);
		emit().onStatus('paused');
		emit().onEnded();
	},
	'element-fails': ({ element, emit }, { stage }) => {
		if (!canFail(element)) return;

		stopElement(element);
		element.hasFailed = true;
		emit().onError(stage);
	},
	'element-pauses': ({ element, emit }) => {
		if (!element.isPlaying) return;

		stopElement(element);
		emit().onStatus('paused');
	},
	'element-plays': ({ element, emit }) => {
		if (element.src === undefined || !element.wantsPlay || element.isPlaying) return;

		element.isPlaying = true;
		emit().onStatus('playing');
	},
	move: ({ store }, { at, to }) => {
		store.getState().moveTrack(at, to);
	},
	next: ({ store }) => {
		store.getState().next();
	},
	pause: ({ store }) => {
		store.getState().pause();
	},
	play: ({ store }) => {
		store.getState().play();
	},
	'play-at': ({ store }, { at }) => {
		store.getState().playAt(at);
	},
	'play-queue': ({ store }, { at }) => {
		store.getState().playQueue(release, release[at % release.length]?.trackId);
	},
	'play-track': ({ store }, { at }) => {
		const track = catalog[at];

		if (track) store.getState().playTrack(track);
	},
	previous: ({ store }) => {
		store.getState().previous();
	},
	remove: ({ store }, { at }) => {
		store.getState().removeAt(at);
	},
	resolve: async ({ scheduler }) => {
		if (scheduler.count() > 0) await scheduler.waitNext(1);
	},
	toggle: ({ store }) => {
		store.getState().togglePaused();
	},
} satisfies Record<string, (session: Session, step: Step) => Promise<void> | void>;

function kinds(weight: number, ...stepKinds: Array<StepKind>) {
	return { arbitrary: fc.constantFrom(...stepKinds), weight };
}

// Weighted so answers and element events land between presses as often as presses land between them
const steps = fc.array(
	fc.record({
		at: fc.nat({ max: 3 }),
		kind: fc.oneof(
			kinds(
				1,
				'clear',
				'move',
				'next',
				'play-at',
				'play-queue',
				'play-track',
				'previous',
				'remove',
			),
			kinds(3, 'pause', 'play', 'toggle'),
			kinds(1, 'element-ends', 'element-pauses'),
			kinds(2, 'element-plays'),
			kinds(2, 'element-fails'),
			kinds(3, 'resolve'),
		),
		stage: fc.constantFrom('decode' as const, 'network' as const, 'unsupported' as const),
		to: fc.nat({ max: 3 }),
	}),
	{ maxLength: 40, minLength: 1, size: 'max' },
);

const answers = fc.array(
	fc.constantFrom<Answer>('ok', 'ok', 'ok', 'ok', 'ok', 'capped', 'declined', 'empty', 'reject'),
	{ minLength: 1 },
);

function stopElement(element: ElementDouble): void {
	element.isPlaying = false;
	element.wantsPlay = false;
}

function canFail(element: ElementDouble): boolean {
	return element.src !== undefined && !element.hasFailed;
}

function sourceUrl(track: Track, call: number): string {
	const queueId =
		'queueId' in track && typeof track.queueId === 'string' ? track.queueId : 'unqueued';

	return `https://api.test/${queueId}/${String(call)}`;
}

function callOf(url: string | undefined): number {
	return Number(url?.split('/').at(-1));
}

function queueIdOf(url: string | undefined): string | undefined {
	return url?.split('/').at(-2);
}

// Mirrors `audio-engine.ts` by hand, so a change to its load, play, pause or reset lands here too
function createElementDouble(element: ElementDouble) {
	function emit(): AudioEngineCallbacks {
		if (!element.callbacks) throw new Error('The engine reported before it was created');

		return element.callbacks;
	}

	const engine: AudioEngine = {
		canPlay: (type) => type !== declinedType,
		currentTime: () => 0,
		element: document.createElement('audio'),
		load: ({ src }) => {
			element.src = src;
			element.hasFailed = false;
			element.isPlaying = false;
			// `load()` aborts a pending `play()`, so the new source plays only if the intent still says so
			element.wantsPlay = !emit().isPaused();
			if (element.wantsPlay) emit().onStatus('loading');

			return Promise.resolve();
		},
		pause: () => {
			if (element.isPlaying) emit().onStatus('paused');

			stopElement(element);
		},
		// With no source, `play()` waits for the next `load()`, which decides afresh
		play: () => {
			element.wantsPlay = true;

			return Promise.resolve();
		},
		// The pause a reset causes is never delivered
		reset: () => {
			element.src = undefined;
			stopElement(element);
		},
		seek: vi.fn(),
		setMuted: vi.fn(),
		setVolume: vi.fn(),
	};

	return {
		createEngine: (callbacks: AudioEngineCallbacks) => {
			element.callbacks = callbacks;

			return engine;
		},
		emit,
	};
}

function openSession(
	scheduler: fc.Scheduler,
	answerCycle: ReadonlyArray<Answer>,
	tally: Tally,
): Session {
	const element: ElementDouble = {
		hasFailed: false,
		isPlaying: false,
		src: undefined,
		wantsPlay: false,
	};
	const { createEngine, emit } = createElementDouble(element);
	const store = createWritablePlayerStore({ createEngine, storage: createMemoryStorage() });
	const session: Session = {
		answerOf: (call) => answerCycle[call % answerCycle.length] ?? 'ok',
		calls: 0,
		element,
		emit,
		mostRetriesInChain: 0,
		retriesInChain: 0,
		scheduler,
		step: undefined,
		store,
		tally,
	};
	const resolve = scheduler.scheduleFunction((track: Track, call: number) =>
		resolutions[session.answerOf(call)](sourceUrl(track, call)),
	);

	async function answered(track: Track, call: number): Promise<StreamResolution> {
		try {
			return await resolve(track, call);
		} finally {
			if (call !== session.calls) tally.staleAnswers += 1;
		}
	}

	store.getState().configure({
		urls: {
			stream: (track) => {
				session.calls += 1;
				session.retriesInChain =
					session.step?.kind === 'element-fails' ? session.retriesInChain + 1 : 0;
				if (session.retriesInChain > 0) tally.retries += 1;
				// Checked after the step, since the controller's catch would swallow a throw from here
				session.mostRetriesInChain = Math.max(session.mostRetriesInChain, session.retriesInChain);

				return answered(track, session.calls);
			},
		},
	});

	return session;
}

function shownQueueId({ store }: Session): string | undefined {
	return loadedTrack(store.getState())?.queueId;
}

function playbackSnapshot({ element, store }: Session) {
	const { currentIndex, isPaused, playbackError, status } = store.getState();

	return {
		currentIndex,
		isPaused,
		playbackError,
		src: element.src,
		status,
		wantsPlay: element.wantsPlay,
	};
}

// Deeper than the controller's longest chain of awaits, the resolve and then the load
async function settleMicrotasks(): Promise<void> {
	for (let hop = 0; hop < 8; hop += 1) await Promise.resolve();
}

interface ExpectedFailure {
	callsBefore: number;
	isDeclined: boolean;
	isOwedRetry: boolean;
}

// Read before the step, while the element still holds the source that fails
function expectedFailure({ answerOf, calls, element, retriesInChain }: Session, step: Step) {
	if (step.kind !== 'element-fails' || !canFail(element)) return;

	return {
		callsBefore: calls,
		isDeclined: step.stage === 'unsupported' && answerOf(callOf(element.src)) === 'declined',
		isOwedRetry: retriesInChain === 0,
	} satisfies ExpectedFailure;
}

function expectFailureHandled(
	session: Session,
	{ callsBefore, isDeclined, isOwedRetry }: ExpectedFailure,
): void {
	const { status } = session.store.getState();

	if (isDeclined) {
		session.tally.unplayable += 1;
		expect(status, 'a declined type failed as unsupported without ending unplayable').toBe(
			'unplayable',
		);
		return;
	}

	if (isOwedRetry) {
		expect(session.calls, 'a first failure since playback was not re-resolved').toBe(
			callsBefore + 1,
		);
		return;
	}

	session.tally.errorsShown += 1;
	expect(['error', 'unplayable'], 'a second failure in a chain showed no error').toContain(status);
}

function expectElementOnShownTrack(session: Session): void {
	const { element, store } = session;
	const { status } = store.getState();

	expect(
		queueIdOf(element.src) ?? shownQueueId(session),
		'the element holds a track the bar does not show',
	).toBe(shownQueueId(session));

	if (!isTerminalStatus(status)) return;

	session.tally.terminalHeld += 1;
	expect(element.src, `the element still holds a source at ${status}`).toBeUndefined();
}

async function runStep(session: Session, step: Step): Promise<void> {
	const { element, tally } = session;
	const staleBefore = tally.staleAnswers;
	const before = playbackSnapshot(session);
	const failure = expectedFailure(session, step);

	session.step = step;
	await stepActions[step.kind](session, step);
	await settleMicrotasks();

	if (step.kind === 'element-plays' && element.isPlaying) session.retriesInChain = 0;

	if (tally.staleAnswers > staleBefore) {
		expect(playbackSnapshot(session), 'a stale answer changed the player').toStrictEqual(before);
	}

	expect(session.mostRetriesInChain, 'a failure re-resolved more than once').toBeLessThanOrEqual(1);

	if (failure) expectFailureHandled(session, failure);

	expectElementOnShownTrack(session);
}

function expectSettledIntent(session: Session): void {
	const { element, store, tally } = session;
	const { isPaused, status } = store.getState();

	if (isPaused) {
		tally.settledPaused += 1;
		expect(element.wantsPlay, 'the bar shows a pause the element ignores').toBe(false);
		return;
	}

	if (isTerminalStatus(status)) return;

	tally.settledPlaying += 1;
	expect(queueIdOf(element.src), 'a play intent settled with nothing loaded').toBe(
		shownQueueId(session),
	);
	expect(element.wantsPlay, 'a play intent settled with the element held paused').toBe(true);
}

test('presses, answers and element events in any order keep the element on the track the bar shows', async () => {
	const tally: Tally = {
		errorsShown: 0,
		retries: 0,
		settledPaused: 0,
		settledPlaying: 0,
		staleAnswers: 0,
		terminalHeld: 0,
		unplayable: 0,
	};

	await fc.assert(
		fc.asyncProperty(
			fc.scheduler(),
			steps,
			answers,
			async (scheduler, sessionSteps, answerCycle) => {
				const session = openSession(scheduler, answerCycle, tally);

				for (const step of sessionSteps) await runStep(session, step);

				session.step = undefined;
				await scheduler.waitIdle();
				await settleMicrotasks();

				expectElementOnShownTrack(session);
				expectSettledIntent(session);
			},
		),
		{ numRuns: 2000 },
	);

	for (const [name, count] of Object.entries(tally)) {
		expect(count, `no run reached ${name}`).toBeGreaterThan(0);
	}
});
