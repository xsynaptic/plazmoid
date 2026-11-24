import { defineConfig } from 'tsdown';

import { tsdownBase } from '../../tsdown.base.ts';

export default defineConfig({
	...tsdownBase,
	copy: [
		{ from: 'src/player.css', to: 'dist' },
		{ from: 'src/styles/*.css', to: 'dist/styles' },
	],
	entry: [
		'src/index.ts',
		'src/astro.ts',
		'src/constants.ts',
		'src/define.ts',
		'src/define/*.ts',
		'src/labels.ts',
	],
});
