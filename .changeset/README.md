# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

1. Make changes to one or more packages.
2. Run `pnpm changeset` and describe the change, picking a semver bump.
3. Commit the generated changeset file alongside the work.
4. When ready to publish, run `pnpm version-packages` to apply version bumps and changelogs, and commit the result.
5. Run `pnpm release` to check, publish to npm, and push with tags.

The `access: public` setting in `config.json` publishes the scoped `@xsynaptic/*` packages publicly.
