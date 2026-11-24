import changelogGit from '@changesets/cli/changelog';

export default {
	...changelogGit,
	getDependencyReleaseLine: () => Promise.resolve(''),
} satisfies typeof changelogGit;
