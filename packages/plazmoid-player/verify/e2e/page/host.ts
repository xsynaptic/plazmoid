import type {
	PlaybackDiagnostic,
	PlayerStoreApi,
	PlayerUrls,
	StreamSource,
	Track,
	TrackDetail,
} from '@xsynaptic/plazmoid-core';
import type { ViewStoreApi } from '@xsynaptic/plazmoid-player';
import type { AstroPlayer } from '@xsynaptic/plazmoid-player/astro';

import { startAstroPlayer } from '@xsynaptic/plazmoid-player/astro';
import stylesheetUrl from '@xsynaptic/plazmoid-player/player.css?url';

import { fixtureOrigin, seekSeconds } from '#e2e/constants.ts';
import { writeFixtureWavedata } from '#e2e/fixture-wavedata.ts';
import { defaultLabels } from '#labels.ts';

interface PlayerPage {
	diagnostics: Array<PlaybackDiagnostic>;
	readonly resolveCount: number;
	store: PlayerStoreApi;
	view: ViewStoreApi;
}

declare global {
	interface Window {
		playerPage?: PlayerPage;
	}
}

const cued: TrackDetail = {
	cuePoints: [{ artistLine: 'Cue Artist', startSeconds: 20, title: 'Cue Title' }],
};

const fixtures = {
	long: { durationMs: 60_000, title: 'Long fixture' },
	short: { durationMs: 6000, title: 'Short fixture' },
} as const;

const streamTypes = {
	capital: 'audio/mp4; codecs="Opus"',
	lowercase: 'audio/mp4; codecs="opus"',
} as const;

const unplayableType = 'audio/x-unplayable';

const parameters = new URLSearchParams(location.search);

const settings = {
	bindDelay: Number(parameters.get('bindDelay') ?? 0),
	detail: readChoice('detail', ['answer', 'hang']),
	hasFallback: parameters.has('fallback'),
	hasWaveform: parameters.has('waveform'),
	isCued: parameters.has('cued'),
	rows: (parameters.get('rows') ?? 'long,short').split(',').filter((row) => isFixture(row)),
	run: parameters.get('run') ?? 'manual',
	stream: readChoice('stream', ['audio', 'missing', 'garbage', 'hang', 'flaky', 'stalled']),
	type: readChoice('type', ['capital', 'lowercase']),
	waveformVersion: readNumber('waveformVersion'),
};

const waveformFacts =
	settings.hasWaveform || settings.isCued ? writeFixtureWavedata().facts : undefined;

let resolveCount = 0;

const unanswered = new Promise<undefined>(() => {
	// Never settles, as a host's detail fetch still in flight
});

const urls: PlayerUrls = {
	detail: (track) => (settings.detail === 'hang' ? unanswered : Promise.resolve(detailOf(track))),
	// Counted, so a spec can tell a re-resolve from a first load
	stream: ({ sources = [] }) => {
		resolveCount += 1;

		return Promise.resolve({ sources, status: 'ok' });
	},
};

function detailOf({ trackId }: Track): TrackDetail {
	const waveform = waveformOf(trackId);

	return { ...(settings.isCued ? cued : {}), ...(waveform ? { waveform } : {}) };
}

function waveformOf(trackId: string): TrackDetail['waveform'] {
	if (!waveformFacts) return undefined;
	if (!settings.hasWaveform) return waveformFacts;

	return {
		...waveformFacts,
		formatVersion: settings.waveformVersion ?? waveformFacts.formatVersion,
		url: wavedataUrl(trackId),
	};
}

function wavedataUrl(trackId: string): string {
	const url = new URL(`/wavedata/${trackId}.wavedata`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function isFixture(row: string): row is keyof typeof fixtures {
	return Object.hasOwn(fixtures, row);
}

function readNumber(name: string): number | undefined {
	const value = parameters.get(name);

	return value === null ? undefined : Number(value);
}

function readChoice<Choice extends string>(
	name: string,
	choices: readonly [Choice, ...Array<Choice>],
): Choice {
	const value = parameters.get(name);

	return choices.find((choice) => choice === value) ?? choices[0];
}

function sourcesOf(trackId: string): Array<StreamSource> {
	const source = { type: streamTypes[settings.type], url: streamUrl(trackId) };

	if (!settings.hasFallback) return [source];

	return [{ type: unplayableType, url: refusedUrl(trackId) }, source];
}

function refusedUrl(trackId: string): string {
	const url = new URL(`/garbage/${trackId}.mp4`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function streamUrl(trackId: string): string {
	const url = new URL(`/${settings.stream}/${trackId}.mp4`, fixtureOrigin);

	url.searchParams.set('run', settings.run);

	return url.href;
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function writePayload(): void {
	const tracks = settings.rows.map((trackId) => ({
		artistLine: 'Fixture Artist',
		artwork: [{ src: `${fixtureOrigin}/audio/art.png`, type: 'image/png', width: 512 }],
		durationMs: fixtures[trackId].durationMs,
		releaseTitle: 'Fixtures',
		sources: sourcesOf(trackId),
		title: fixtures[trackId].title,
		trackId,
	}));
	const payload = document.createElement('div');

	payload.dataset.pzmPayload = JSON.stringify(tracks);
	payload.hidden = true;
	document.body.append(payload);
}

writePayload();

// The store keeps only the latest; a host is sent every one, so a spec reads them all
const diagnostics: Array<PlaybackDiagnostic> = [];

startAstroPlayer(() => ({
	load: async () => {
		await wait(settings.bindDelay);

		return {
			onEvent: (event) => {
				if (event.kind === 'diagnostic') diagnostics.push(event.diagnostic);
			},
			onReady: exposePlayer,
		};
	},
	player: { labels: defaultLabels },
	seekSeconds,
	stylesheetUrl,
	urls: () => urls,
}));

function exposePlayer({ store, view }: AstroPlayer): void {
	Object.defineProperty(window, 'playerPage', {
		value: {
			diagnostics,
			get resolveCount() {
				return resolveCount;
			},
			store,
			view,
		} satisfies PlayerPage,
	});
}
