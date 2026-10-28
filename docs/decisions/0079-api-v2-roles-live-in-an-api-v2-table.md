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
#3187 and #3197 implement the answers.

## Decision

**Roles are rows in an api_v2 table**, not GitHub team memberships. A user
can hold any of three roles:

- `editor` can create and edit content, and submit changes for review.
- `approver` can change a page's visibility, and approve, reject and publish
  changes to live content.
- `admin` can grant and revoke roles.

Sign-in itself doesn't change: GitHub org membership still decides who can
sign in. Roles decide what a signed-in user can do.

**Every org member is an editor by default.** At first sign-in, api_v2 grants
the user an `editor` row. It is an ordinary row, so an admin can revoke it to
take write access away from one person who stays in the organisation. A
signed-in user with no role can read the editor but can't write anything.

**Admins manage roles through admin-only api_v2 routes.** There is no admin
screen in editor_v2 yet; that is a follow-up. The first admins come from an
environment allowlist of email addresses (`API_V2_ADMIN_EMAILS`): a signed-in
user whose verified email is listed is granted `admin`. Each grant records who
made it.

**Roles are read on every request**, not frozen into the session at sign-in,
so a revocation takes effect on the user's next request.

**An approver can't approve their own change.** The person who approves or
publishes a revision must be someone other than the person who submitted it.

**Roles are enforced in api_v2**, not only in editor_v2. editor_v2 hides or
disables what a user's roles don't allow, but the API answers 403 and leaves
the database unchanged. The route sign-in test (#3075) is extended so a write
route can't be added without the role it needs.

## Alternatives considered

- **GitHub teams**, as feature_flagging does (`GITHUB_TEAM_SLUG`). There'd be
  no admin role or screens to build, but membership could only be checked at
  sign-in, while the OAuth token is held. A revocation would then wait for the
  session to expire, and roles would be managed outside the product.
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
- An environment needs at least two approvers before any change can be
  published, because nobody can approve their own change.
- Roles in feature_flagging and the v1 form builder are unchanged (out of
  scope for #3166).
