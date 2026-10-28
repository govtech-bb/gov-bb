# 0079. api_v2 roles live in an api_v2 table

**Date:** 2026-10-28
**Status:** Accepted

## Context

This decision resolves the role model in #3196, part of #3166. api_v2 admits
any active member of the `govtech-bb` GitHub organisation, and every signed-in
user has the same rights. Once landing reads from api_v2, a page's
`visibility` is the only switch for what citizens see, so anyone who can edit
a page can also publish it. The review flow in #3166 needs people who propose
changes to be separate from people who publish them.

The epic left three questions open: where roles come from, whether an admin
role manages them, and whether an approver can approve their own change.
#3187 and #3197 implement the role source and checks below. The review flow
that the self-approval rule governs comes in #3198, #3199 and #3201.

## Decision

**Roles are rows in an api_v2 table**, not GitHub team memberships. A user
can hold any of three roles:

- `editor` can create and edit content, submit changes for review, and manage
  categories (ADR 0078's "people who can edit pages" are editors).
- `approver` can change a page's visibility, delete a public page, and
  approve, reject and publish changes to live content.
- `admin` can grant and revoke roles.

Sign-in itself doesn't change: GitHub org membership still decides who can
sign in. Roles decide what a signed-in user can do.

**Every org member is an editor by default.** api_v2 grants an `editor` row
once, when it creates the user at their first sign-in. A migration grants the
same row to every user who already exists. Because the grant happens once,
an admin can revoke it to take write access away from one person who stays in
the organisation, and it doesn't come back at their next sign-in. A signed-in
user with no role can read the editor but can't write anything.

**Admins manage roles through admin-only api_v2 routes.** There is no admin
screen in editor_v2 yet; that is a follow-up. The first admins come from an
environment allowlist of email addresses (`API_V2_ADMIN_EMAILS`): a signed-in
user whose verified email is listed is granted `admin` whenever they sign in.
The allowlist is how an environment always has an admin, so an admin can't
revoke a listed admin for good; to remove one, take them off the list and
then revoke the row. Each grant records the admin who made it. Grants that
api_v2 makes itself (the default editor role and the allowlist) record no
grantor.

**Roles are read on every request**, not frozen into the session at sign-in,
so a revocation takes effect on the user's next request.

**An approver can't approve their own change.** The person who approves or
publishes a revision must be someone other than anyone who submitted it or
changed its content.

**Changing visibility is a direct approver action for now.** Until #3201
runs new pages, unpublishing and deleting through review, an approver who
changes a page's visibility does so straight away, and the self-approval rule
doesn't apply. So, in the meantime, an approver can still publish a page
they wrote. #3201 closes this gap.

**Roles are enforced in api_v2**, not only in editor_v2. editor_v2 hides or
disables what a user's roles don't allow, but the API answers 403 and leaves
the database unchanged. The route sign-in test (#3075) is extended so a write
route can't be added without the role it needs.

**Local development under `AUTH_BYPASS`** runs as one user who holds all
three roles. The self-approval rule is relaxed there only, so one developer
can try the whole flow.

## Alternatives considered

- **GitHub teams**, as feature_flagging does (`GITHUB_TEAM_SLUG`). There'd be
  no admin role or screens to build. But api_v2 discards the user's OAuth
  token after sign-in, so membership could only be checked then. A
  revocation would wait for the session to expire, and roles would be
  managed outside the product.
- **Both**: teams for starting roles, plus table overrides. This is the most
  flexible option, but it has two sources of truth for one question.
- **Implicit editor role** for every org member, with no row. It's simpler,
  but the only way to stop one person writing would be to remove them from
  the organisation.
- **Self-approval allowed.** It's quicker for a small team, but one person
  could change the live site alone, which is what #3166 exists to prevent.

## Consequences

- An environment with no `API_V2_ADMIN_EMAILS` has no admin, so nobody can
  grant `approver`. Every deployed environment must set it.
- An approver's own changes need a second approver to publish them. An
  environment with only one approver can publish only changes that other
  people submitted.
- Org membership is checked only at sign-in, and a session lasts up to 8
  hours. Someone who leaves `govtech-bb` keeps their access until their
  session ends, and their role rows come back if they rejoin. Offboarding
  someone means revoking their roles as well as removing them from the org.
- Until #3198 and #3199 land, an editor's save to a public page still
  changes what citizens see straight away. Only visibility changes and
  deleting a public page need an approver in the meantime.
- Roles in feature_flagging and the v1 form builder are unchanged (out of
  scope for #3166).
