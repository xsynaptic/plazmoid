import { defineConfig } from 'tsdown';

import { tsdownBase } from '../../tsdown.base.ts';

export default defineConfig({
	...tsdownBase,
	// The `./node` entry imports Node's built-ins, which the browser platform reports as unresolved
	deps: { neverBundle: [/^node:/] },
	entry: ['src/index.ts', 'src/node.ts'],
});
