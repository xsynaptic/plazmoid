import type { PlayerUrls, Track } from '#types.ts';

import { toStoredTrack } from '#store/stored-shapes.ts';

export async function resolveTracks(
	resolve: NonNullable<PlayerUrls['tracks']>,
	trackIds: ReadonlyArray<string>,
): Promise<Array<Track>> {
	const answered: unknown = await resolve(trackIds);
	if (!Array.isArray(answered)) return [];

	const rows = new Map<string, Track>();

	for (const entry of answered) {
		const track = toStoredTrack(entry);

		if (track && !rows.has(track.trackId)) rows.set(track.trackId, track);
	}

	return trackIds.map((trackId) => rows.get(trackId)).filter((track) => track !== undefined);
}
