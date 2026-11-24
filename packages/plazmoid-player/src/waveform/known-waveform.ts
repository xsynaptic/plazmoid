import type { TrackDetail } from '@xsynaptic/plazmoid-core';

import { formatVersion } from '@xsynaptic/plazmoid-wavedata';

export function knownWaveform(detail: TrackDetail | undefined) {
	const waveform = detail?.waveform;

	return waveform?.formatVersion === formatVersion ? waveform : undefined;
}
