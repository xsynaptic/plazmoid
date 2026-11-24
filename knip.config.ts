import type { KnipConfig } from 'knip';

export default {
	// A stale ignore is a suppression that outlived its reason
	treatConfigHintsAsErrors: true,
	workspaces: {
		'packages/plazmoid-player': {
			// The e2e page's script, loaded by the page's own HTML
			entry: ['verify/e2e/page/host.ts'],
		},
	},
} satisfies KnipConfig;
