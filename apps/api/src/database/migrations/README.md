# API Migrations

TypeORM migrations for forms-db. Each file is named `<timestamp>-<Name>.ts` and is loaded automatically by `pnpm migration:run` in the API container.

## CD gating

The staging + sandbox deploy workflows gate the `Run database migrations` step on `git diff` finding changes under this directory between the last successful deploy and HEAD. New migrations land naturally; nothing extra needed beyond the file.

## Bootstrap caveat

On a brand-new DB (first ever deploy to a fresh env), this diff-based gate misses — no migration FILES changed since the previous commit, but every migration still needs to run. Mitigation: when standing up a new env, ensure the first staging-affecting commit also touches a migration file (or this README) so the gate trips and migrations actually run.
