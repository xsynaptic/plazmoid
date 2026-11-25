import type { WavedataDescriptor } from '@xsynaptic/plazmoid-wavedata';

import type { Track, TrackDetail } from '#types.ts';

import { isRecord } from '#lib/is-record.ts';

type FieldChecks = Record<string, (value: unknown) => boolean>;

const trackChecks: FieldChecks = {
	artwork: (value) => isArrayOf(value, isArtwork),
	// `Intl.DurationFormat` throws past the safe-integer range
	durationMs: (value) => isNonNegativeNumber(value) && value <= Number.MAX_SAFE_INTEGER,
	releaseHref: (value) => typeof value === 'string',
	sources: (value) => isArrayOf(value, isStreamSource),
};

const bandsChecks = {
	medians: (field) =>
		Array.isArray(field) && field.length === 3 && isArrayOf(field, isFiniteNumber),
} satisfies Record<keyof NonNullable<WavedataDescriptor['bands']>, FieldChecks[string]>;

const waveformChecks = {
	bands: (field) => field === undefined || hasFields(field, bandsChecks),
	formatVersion: isCount,
	mode: (field) => typeof field === 'string',
	overview: (field) => typeof field === 'string',
	pairCount: (field) => isCount(field) && field > 0,
	rmsRange: (field) =>
		Array.isArray(field) && field.length === 2 && field.every((end) => isFiniteNumber(end)),
	sampleRate: isPositiveNumber,
	url: (field) => field === undefined || typeof field === 'string',
} satisfies Record<keyof WavedataDescriptor, FieldChecks[string]>;

const detailChecks: FieldChecks = {
	cuePoints: (value) => isArrayOf(value, isCuePoint),
	// Version 1's waveform fields, dropped from a detail stored before version 2
	peaks: () => false,
	trackCount: isCount,
	waveform: (value) => hasFields(value, waveformChecks),
	waveformOverview: () => false,
};

export function toStoredDetail(value: unknown): TrackDetail | undefined {
	if (!isRecord(value)) return undefined;

	const detail = keepValidFields(value, detailChecks);

	return isDetail(detail) ? detail : undefined;
}

// Unknown fields are kept because resolvers expect the track exactly as the host queued it
export function toStoredTrack(value: unknown): Track | undefined {
	if (!isRecord(value)) return undefined;

	const track = keepValidFields(value, trackChecks);

	return isTrack(track) ? track : undefined;
}

function hasFields(value: unknown, checks: FieldChecks): boolean {
	if (!isRecord(value)) return false;

	return Object.entries(checks).every(([key, isValid]) => isValid(value[key]));
}

function hasOptionalFields(value: Record<string, unknown>, checks: FieldChecks): boolean {
	return Object.entries(checks).every(
		([key, isValid]) => value[key] === undefined || isValid(value[key]),
	);
}

function isArrayOf(value: unknown, isValid: (track: unknown) => boolean): boolean {
	return Array.isArray(value) && value.every((track) => isValid(track));
}

function isArtwork(value: unknown): boolean {
	if (!isRecord(value)) return false;

	return (
		typeof value.src === 'string' &&
		isPositiveNumber(value.width) &&
		(value.type === undefined || typeof value.type === 'string')
	);
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCuePoint(value: unknown): boolean {
	return hasFields(value, {
		artistLine: (field) => typeof field === 'string',
		startSeconds: isNonNegativeNumber,
		title: (field) => typeof field === 'string',
	});
}

function isDetail(value: unknown): value is TrackDetail {
	return isRecord(value) && hasOptionalFields(value, detailChecks);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isStreamSource(value: unknown): boolean {
	if (!isRecord(value)) return false;

	return (
		typeof value.url === 'string' && (value.type === undefined || typeof value.type === 'string')
	);
}

function isTrack(value: unknown): value is Track {
	if (!isRecord(value)) return false;

	return (
		['artistLine', 'trackId', 'releaseTitle', 'title'].every(
			(key) => typeof value[key] === 'string',
		) && hasOptionalFields(value, trackChecks)
	);
}

function isNonNegativeNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): boolean {
	return isFiniteNumber(value) && value > 0;
}

function keepValidFields(value: Record<string, unknown>, checks: FieldChecks) {
	return Object.fromEntries(
		Object.entries(value).filter(([key, field]) => checks[key]?.(field) ?? true),
	);
}
