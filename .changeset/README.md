# Changesets

This directory contains changesets for `@agent-commons/sdk` and `@agent-commons/cli`.

In CI, a patch changeset is auto-generated whenever package source files change and no manual changeset exists. For minor or major bumps, run:

```sh
pnpm changeset
```

and commit the generated `.md` file before merging to `main`.
