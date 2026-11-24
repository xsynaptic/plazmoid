import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		environment: 'happy-dom',
		environmentOptions: { happyDOM: { settings: { enableCSSFileLoading: true } } },
		include: ['src/**/*.test.ts'],
		name: 'player',
	},
});
