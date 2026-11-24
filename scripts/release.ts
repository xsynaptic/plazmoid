#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { styleText } from 'node:util';

interface PackageManifest {
	name: string;
	private?: boolean;
	version: string;
}

const releasePaths = [
	'packages',
	'scripts',
	'.changeset',
	'pnpm-lock.yaml',
	'package.json',
	'tsconfig.base.json',
];

const isDryRun = process.argv.includes('--dry-run');
const releaseStartedAt = performance.now();

// Captured steps write to a file, so their tools only colour when told to; lefthook reads CLICOLOR_FORCE
const stepEnvironment =
	process.stdout.isTTY && process.env.NO_COLOR === undefined
		? { ...process.env, CLICOLOR_FORCE: '1', FORCE_COLOR: '1' }
		: process.env;

function secondsSince(startedAt: number) {
	return `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
}

function run(command: string, args: Array<string>) {
	const result = spawnSync(command, args, { stdio: 'inherit' });

	if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(command: string, args: Array<string>) {
	return spawnSync(command, args, { encoding: 'utf8' });
}

function runStep(label: string, args: Array<string>) {
	const logDirectory = mkdtempSync(path.join(tmpdir(), 'release-'));
	const logPath = path.join(logDirectory, 'output.log');
	const logFile = openSync(logPath, 'w');
	const startedAt = performance.now();

	process.stdout.write(`${styleText('dim', '•')} ${label} `);

	// One descriptor for both streams keeps the log in the order the child wrote it
	const result = spawnSync('pnpm', args, {
		env: stepEnvironment,
		stdio: ['ignore', logFile, logFile],
	});

	closeSync(logFile);

	const output = readFileSync(logPath, 'utf8');

	rmSync(logDirectory, { recursive: true });

	if (result.status !== 0) {
		console.log(styleText('red', `failed after ${secondsSince(startedAt)}`), '\n');
		process.stdout.write(output);
		process.exit(result.status ?? 1);
	}

	console.log(styleText('dim', secondsSince(startedAt)));
}

function exitWith(message: string) {
	console.error(styleText('red', message));
	process.exit(1);
}

async function isPublished({ name, version }: PackageManifest) {
	const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, {
		method: 'HEAD',
		signal: AbortSignal.timeout(10_000),
	});

	if (response.status === 404) return false;
	if (!response.ok)
		throw new Error(`npm registry answered ${String(response.status)} for ${name}@${version}`);

	return true;
}

function isTaggedOnOrigin(tag: string) {
	const result = capture('git', ['ls-remote', '--tags', '--refs', 'origin', `refs/tags/${tag}`]);

	if (result.status !== 0) exitWith(`Could not list tags on origin:\n${result.stderr}`);

	return result.stdout.trim() !== '';
}

function readManifests() {
	return readdirSync('packages')
		.map(
			(directory) =>
				JSON.parse(
					readFileSync(path.join('packages', directory, 'package.json'), 'utf8'),
				) as PackageManifest,
		)
		.filter((manifest) => manifest.private !== true);
}

const branch = capture('git', ['symbolic-ref', '--quiet', '--short', 'HEAD']).stdout.trim();

// A publish from any other branch lands on npm and then fails to push
if (branch !== 'main') exitWith(`Release from main; HEAD is ${branch || 'detached'}`);

const uncommitted = capture('git', [
	'status',
	'--porcelain',
	'--',
	...releasePaths,
]).stdout.trimEnd();

// `changeset publish` packs from the working tree, so it must match what is committed
if (uncommitted) exitWith(`Commit or stash these before releasing:\n${uncommitted}`);

const hasChangesets = readdirSync('.changeset').some(
	(fileName) => fileName.endsWith('.md') && fileName !== 'README.md',
);

if (hasChangesets) exitWith('Pending changesets; run `pnpm version-packages` and commit first');

const fetchResult = capture('git', ['fetch', '--quiet', 'origin', 'main']);

if (fetchResult.status !== 0) exitWith(`Could not fetch origin/main:\n${fetchResult.stderr}`);

if (capture('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).status !== 0)
	exitWith('origin/main has commits that HEAD lacks; pull before releasing');

const manifests = readManifests();
const publishedStates = await Promise.all(manifests.map((manifest) => isPublished(manifest)));
const pending = manifests.filter((_manifest, index) => publishedStates[index] !== true);

if (pending.length === 0) {
	const untagged = manifests
		.map((manifest) => `${manifest.name}@${manifest.version}`)
		.filter((tag) => !isTaggedOnOrigin(tag));

	if (untagged.length > 0)
		exitWith(
			`On npm but not tagged on origin: ${untagged.join(', ')}; push with \`git push --follow-tags origin main\``,
		);

	console.log('Nothing to release; every package version is already on npm');
	process.exit(0);
}

const whoami = capture('npm', ['whoami']);

if (whoami.status !== 0) exitWith('Not logged in to npm; run `npm login` first');

const pendingTags = pending.map((manifest) => `${manifest.name}@${manifest.version}`);

console.log(
	`${styleText('bold', `${isDryRun ? 'Rehearsing' : 'Releasing'} ${pendingTags.join(', ')}`)} as ${whoami.stdout.trim()}\n`,
);

// The check builds every package, and each build runs publint
runStep('pnpm check', ['check']);

if (isDryRun) {
	console.log(`\nDry run passed in ${secondsSince(releaseStartedAt)}; nothing published`);
	process.exit(0);
}

console.log();
run('pnpm', ['changeset', 'publish']);
// The checks above already gated this tree; the hook would recheck unrelated work in progress
run('git', ['push', '--no-verify', '--follow-tags', 'origin', 'main']);

console.log(
	`\n${styleText('green', `Released ${pendingTags.join(', ')}`)} in ${secondsSince(releaseStartedAt)}`,
);

for (const manifest of pending)
	console.log(
		styleText('dim', `https://www.npmjs.com/package/${manifest.name}/v/${manifest.version}`),
	);
