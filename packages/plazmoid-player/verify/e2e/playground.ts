import { spawn, spawnSync } from 'node:child_process';

import { pagePort } from '#e2e/constants.ts';

function pnpm(args: Array<string>) {
	const result = spawnSync('pnpm', args, { stdio: 'inherit' });

	if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed`);
}

pnpm(['--workspace-root', 'build']);
pnpm(['cut-fixtures']);

const servers = [
	spawn('node', ['verify/e2e/fixture-server.ts'], { stdio: 'inherit' }),
	spawn(
		'pnpm',
		[
			'exec',
			'vite',
			'verify/e2e/page',
			'--port',
			String(pagePort),
			'--strictPort',
			'--open',
			'/?peaks&cued',
		],
		{ stdio: 'inherit' },
	),
];

function stop() {
	for (const server of servers) server.kill();
}

process.on('SIGINT', stop);

for (const server of servers) server.on('exit', stop);
