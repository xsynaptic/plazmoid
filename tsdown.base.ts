import type { UserConfig } from 'tsdown';

export const tsdownBase = {
	clean: ['dist'],
	dts: true,
	format: 'esm',
	minify: false,
	outDir: 'dist',
	platform: 'browser',
	publint: true,
	report: false,
	unbundle: true,
} satisfies UserConfig;
