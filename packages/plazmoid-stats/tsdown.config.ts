import { defineConfig } from 'tsdown';

import { tsdownBase } from '../../tsdown.base.ts';

export default defineConfig({ ...tsdownBase, entry: ['src/monitor-playback.ts'] });
