# E2E service-status token runbook

`E2E_SERVICE_STATUS_TOKEN` lets the post-deploy check "Journey 3 — feature-flag
reaches landing + forms" in `deploy-sandbox.yml` call `PUT /service_status` on
the sandbox API. It flips the test service `e2e-maintenance-check` to
maintenance and back. Background: #3363, #3010.

**The token expires on 2027-02-01. Renew it by 2027-01-25.** Once it expires,
Journey 3 fails and every sandbox → staging promotion is skipped until a new
token is stored.

## What exists

| Thing | Value |
| --- | --- |
| Owner | Joshua Cummins (`JoshuaGovTech`). The owner renews the token, is the first call when Journey 3 fails on auth, and holds the bot account's 2FA |
| Bot account | `govtech-bb-e2e`, an org member with 2FA. Registered to a Google Group shared inbox that all the developers are members of, so GitHub's expiry and security emails reach everyone. Only the owner can sign in, because the owner holds the 2FA |
| Team | `feature-management-sandbox`, the only team the bot is on |
| Token | Fine-grained, resource owner `govtech-bb`, organisation permission *Members: read* only, no repository permissions, 90-day expiry |
| Secret | `E2E_SERVICE_STATUS_TOKEN` on the `sandbox-e2e` GitHub Environment in gov-bb, last set 2026-11-03 |
| Environment | `sandbox-e2e`, deployable from `main` only, no required reviewers |

There is no second owner yet. One will be added once the team decides how the
bot's sign-in is shared. The likely approach is to keep its 2FA recovery codes
in a shared vault. Until then, only the owner can renew the token, so this
should be settled before the first renewal on 2027-01-25.

## Why it is set up this way

The API lets a caller change `service_status` if their GitHub token belongs to
an active member of `GITHUB_TEAM_SLUG`, or to someone with write on gov-bb
(`apps/api/src/common/github-identity.ts`).

Staging and prod check the team `content-and-feature-management`. Sandbox checks
its parent team, `feature-management-sandbox` (govtech-bb/alpha-infra#786).
Members of a child team count as members of the parent, so people on
`content-and-feature-management` are still admins in sandbox. The bot is on the
parent only, so its token works in sandbox and nowhere else.

Keep it that way:

- Do not add the bot to `content-and-feature-management` or any other team.
- Do not give the bot write on gov-bb. It has read today.
- Do not add required reviewers to `sandbox-e2e`. Every deploy would wait for a
  manual approval.
- Do not move the secret to a repo or org secret. Any workflow on any branch
  could then read it.

## Renew the token

1. Sign in to GitHub as `govtech-bb-e2e`. Only the owner can, because the owner
   holds its 2FA.
2. Go to Settings → Developer settings → Personal access tokens → Fine-grained
   tokens. Open the existing token and choose **Regenerate token**, with a
   90-day expiry. Regenerating keeps the resource owner and permissions.

   If you have to create one from scratch instead: resource owner `govtech-bb`,
   repository access "Public repositories", organisation permission
   *Members: Read-only*, nothing else.
3. If GitHub shows the token as pending, an org owner approves it under
   Organisation settings → Personal access tokens → Pending requests.
4. Check the token before storing it. All three must hold:

   ```bash
   read -rs TOKEN   # paste the token, press Enter
   gh_get() { curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "https://api.github.com$1"; }

   # the bot's login, and the new expiry date
   curl -si -H "Authorization: Bearer $TOKEN" https://api.github.com/user \
     | grep -iE '"login"|github-authentication-token-expiration'

   # 200: active on the sandbox team
   gh_get /orgs/govtech-bb/teams/feature-management-sandbox/memberships/govtech-bb-e2e

   # 404: not on the staging and prod team
   gh_get /orgs/govtech-bb/teams/content-and-feature-management/memberships/govtech-bb-e2e
   ```

5. Store it. This needs admin on gov-bb:

   ```bash
   printf '%s' "$TOKEN" | gh secret set E2E_SERVICE_STATUS_TOKEN \
     --env sandbox-e2e --repo govtech-bb/gov-bb
   unset TOKEN
   ```

6. On the next merge to `main`, open the "Deploy Sandbox" run and confirm
   "Journey 3 — feature-flag reaches landing + forms" passes and reports
   `1 passed`, and that "Promote to staging" ran.
7. Update the expiry date and the "last set" date at the top of this page.

## If Journey 3 fails

- **401 or 403 from `PUT /service_status`:** the token has expired, was
  revoked, or the bot is no longer on `feature-management-sandbox`. Run the
  checks in step 4 with the current token if you have it. Otherwise renew.
- **A warning that the token is not provisioned, and the job passes:** the
  secret is empty or missing from `sandbox-e2e`. The check did not run. Store
  the token again (step 5).
- **A human can no longer change a service's status in sandbox:** check that
  `content-and-feature-management` still has `feature-management-sandbox` as its
  parent team, and that sandbox's `GITHUB_TEAM_SLUG` is still
  `feature-management-sandbox` in alpha-infra.

## If the token leaks

Sign in as `govtech-bb-e2e`, delete the token, then follow "Renew the token".
The leaked token can only change `service_status` in sandbox and read org
membership.
