# Project conventions

## Git / PR workflow

- **All pull requests target `dev`, not `main`.** `dev` is the integration branch; `main` is updated via merges from `dev`. When opening a PR with `gh pr create`, always pass `--base dev`.
