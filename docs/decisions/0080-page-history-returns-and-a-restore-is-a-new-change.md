# 0080. Page history returns, and a restore is a new change

**Date:** 2026-11-05
**Status:** Accepted

## Context

This decision resolves #3231, part of the audit trail epic #3163, whose
outcome is that "a bad change can be undone". #3079 removed editor_v2's
history view and its restore controls, and #3163 asked whether they come
back.

Since then, api_v2 has gained what a history needs. A database trigger
writes a `change_events` row for every change to a page, attributed to the
user who made it (#3169). The review flow records each review step in the
same history (#3200). `change_events` is append-only: a trigger refuses
updates and deletes, and another refuses `TRUNCATE`. The only exception is
an operator's controlled redaction of a snapshot (migration `019`).

#3423 has already brought the history back as a read-only screen:
`GET /pages/:id/history` and "View page history" in editor_v2. Two
questions were left: can an editor roll a page back, and if so, what does
a rollback do to the history?

## Decision

**Page history stays.** Editors see every change to a page and every review
step, with who made it and when (#3423).

**An editor can restore a page to an earlier version, and the restore is a
new change.** A restore never deletes, rewrites or hides an entry. It saves
the fields that the chosen version recorded over the page as it stands now.
The history then reads forward: the bad change, and after it the restore
that undid it, by the person who restored it.

- `POST /pages/:id/history/:version/restore` needs the editor role and the
  `updated_at` the editor last read. A page that has changed since gets a
  409, as a save does.
- A restore is a save in every way except where its fields come from. It
  follows the same rules for checks, placement, conflicts and review.
- **A restore keeps the page's current visibility.** It brings back what a
  page says and where it sits, not who can see it. Changing visibility stays
  a direct approver action (ADR 0079).
- **On a page that isn't public, the restore is written to the page**, and
  its history entry is `reverted`, with the restored version in a new
  `change_events.restored_from` column. The `reverted` action has been in
  the `change_action` enum since `001`, unused until now.
- **On a public page, the restore goes into the page's pending revision**,
  as any save does. An editor submits it, and an approver who didn't make
  it publishes it. Citizens never see restored content that nobody
  reviewed. Its history reads as any reviewed change: `submitted`,
  `approved`, then the live `updated`. No entry is marked `reverted`,
  because a draft revision can be edited again before it is submitted, so
  it might no longer be the restored version.
- Only a version of the page can be restored: an entry whose snapshot is a
  `content_pages` row with every field a save needs. A review step (its
  snapshot is a revision), a deletion, a redacted entry or a snapshot from
  before the page's current fields gets a 409 `not_restorable`.

The database writes the `reverted` entry, as it writes every other entry.
The restore sets `app.restored_page` and `app.restored_from` for its
transaction, as it already sets `app.user_id`, and `record_change()`
(migration `022`) uses them. Only that page's update is marked. A sub-page
that the same save files under its category is `updated`, as it is on any
save.

## Alternatives considered

- **Read-only history, with no restore.** This is the simplest option, but
  an editor who wants to undo a change has to copy the old content back by
  hand, field by field. That doesn't meet #3163's outcome.
- **Rewind: delete or hide the entries after the restored version.** This
  makes the history match the page, but it breaks the append-only rule that
  the audit trail depends on. A change that reached citizens would leave no
  record, and nobody could see who undid it.
- **Restore visibility too.** This is a truer copy of the old version. But
  it lets an editor change who sees a page, which ADR 0079 gives only to
  approvers. It would also let an approver publish content they restored
  without a second approver.
- **Write a public page's restore straight to the live page.** This would
  undo a bad public change faster. But it bypasses review: anyone with the
  editor role could put any earlier content in front of citizens. An urgent
  takedown is already possible, because an approver can take a page out of
  public view at once (ADR 0079).
- **Mark the restore in the snapshot, not in a column.** This needs no
  schema change. But the snapshot is the row as stored, and anything that
  reads it as a row would have to strip the marker first.

## Consequences

- A page's history only grows. "Undo" is a new entry by the person who
  restored the page, so the audit trail shows the bad change and its fix.
- `change_events` gains a nullable `restored_from`. It is null on every
  entry except a `reverted` one.
- Restoring a public page takes as long as any other reviewed change. To get
  bad content off the site at once, an approver takes the page out of
  public view first.
- Versions recorded before the page's current fields existed can't be
  restored. The history still lists them.
- editor_v2 needs a "Restore this version" action on the history screen.
  It is a follow-up: the API is ready for it.
