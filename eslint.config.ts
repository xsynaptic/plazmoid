import { getBrowserConfig, getConfig, getWebComponentConfig } from '@xsynaptic/eslint-config';
import globals from 'globals';

export default getConfig([
	{
		ignores: [
			'**/dist/**',
			'**/.cache/**',
			'**/temp/**',
			'**/playwright-report/**',
			'**/test-results/**',
			'.claude/**',
		],
	},
	{
		rules: {
			complexity: ['warn', { max: 8, variant: 'modified' }],
			'logical-assignment-operators': ['error', 'never'],
			'max-depth': ['warn', 3],
			'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
			'max-params': ['warn', 3],
			'max-statements': ['warn', 25],
			'unicorn/logical-assignment-operators': 'off',
			// The shared default of 5 makes room for schema chains, which this repo has none of
			'unicorn/max-nested-calls': ['error', { max: 4 }],
		},
	},
	{
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'unicorn/consistent-compound-words': 'error',
			'unicorn/no-array-sort': 'error',
			'unicorn/no-invalid-argument-count': 'error',
			'unicorn/no-top-level-assignment-in-function': 'error',
		},
	},
	{
		files: [
			'**/*.test.ts',
			'packages/*/src/test/**/*.ts',
			'packages/plazmoid-player/verify/**/*.ts',
		],
		rules: {
			'unicorn/consistent-boolean-name': 'off',
			'unicorn/no-top-level-assignment-in-function': 'off',
		},
	},
	{
		files: ['packages/*/src/**/*.ts'],
		ignores: ['**/*.test.ts'],
		rules: {
			'no-restricted-properties': [
				'error',
				...['toReversed', 'toSorted', 'toSpliced', 'with'].map((property) => ({
					message: 'Copy then mutate instead (`[...array].sort()`)',
					property,
				})),
			],
			'unicorn/no-array-reverse': 'off',
			'unicorn/no-array-sort': 'off',
		},
	},
	{
		// Core stays free of wavedata's runtime; only its record types cross the seam
		files: ['packages/plazmoid-core/src/**/*'],
		rules: {
			'@typescript-eslint/no-restricted-imports': [
				'error',
				{
					paths: [
						{
							allowTypeImports: true,
							message: 'Core takes only types from wavedata; write `import type`',
							name: '@xsynaptic/plazmoid-wavedata',
						},
					],
					patterns: [
						{
							group: ['@xsynaptic/sonic-ui', '@xsynaptic/sonic-ui/*'],
							message: 'Core is headless; controls belong to the player.',
						},
					],
				},
			],
		},
	},
	// Everything shipped is browser code; only config files and scripts see Node
	getBrowserConfig(['packages/*/src/**/*']),
	{
		files: [
			'packages/plazmoid-player/verify/e2e/**/*',
			'packages/plazmoid-player/playwright.config.ts',
		],
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
		rules: {
			'unicorn/prefer-global-this': 'off',
		},
	},
	{
		// Prettier formats the `/* HTML */` literals these elements render from; the rule reindents what it just laid out
		files: ['packages/plazmoid-player/src/elements/**/*.ts'],
		rules: {
			'unicorn/template-indent': 'off',
		},
	},
	getWebComponentConfig(['packages/plazmoid-player/src/**/*.ts']),
]);
