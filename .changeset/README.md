# Changesets

Add a changeset for every user-visible package change:

```bash
pnpm changeset
```

Choose `patch`, `minor`, or `major` from the public compatibility impact and
write a concise changelog entry. Documentation, tests, and release tooling
changes do not require a changeset unless they alter the published package.

Changesets Action maintains the release pull request on `main`. Merging that
pull request publishes the version through npm Trusted Publishing.
