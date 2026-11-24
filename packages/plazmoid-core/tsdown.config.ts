import { defineConfig } from 'tsdown';

import { tsdownBase } from '../../tsdown.base.ts';

export default defineConfig({
	...tsdownBase,
	entry: ['src/index.ts', 'src/boot.ts', 'src/constants.ts', 'src/testing.ts'],
});
