# Trust pages: about, contact, privacy, accessibility statement

## Problem

The site has no about page, contact page, privacy page or accessibility
statement. `/terms-conditions` holds the only privacy text ("Your data"),
gets 433 impressions a quarter at 0.23 % CTR, and is indexed under the old
site's "Page not found" title. The agent-readiness scan fails "trust anchor
pages" (about/contact/privacy with ≥ 500 characters), and brand-name search
("Government of Barbados") returns the legacy gov.bb, not this site.

Contact intent is visible in search: "welfare office barbados" (1,369
impressions), "welfare department barbados number" (132), "barbados
government website" (238).

## Impact

E-E-A-T for a government domain rests on being verifiably who it says it is;
AI answer engines check exactly these pages before recommending a source; an
accessibility statement is standard for public-sector sites.

## Where

- Content: new `apps/landing/src/content/{about,contact,privacy,accessibility}.md`
  (or the equivalent in the content model), linked from the footer (issue 12).
- `terms-conditions.md`: split the privacy section out.
- `lib/structured-data.ts`: `contactPoint`/`address` (issue 11) should match
  the contact page.

## Fix

1. Publish four pages with real content: what alpha.gov.bb is and who runs it
   (GovTech Barbados), how to contact government services (switchboard,
   main departments' numbers, how to give feedback), privacy notice (Umami is
   cookieless; forms data handling), accessibility statement (WCAG 2.2 AA
   target, known issues, how to report a problem).
2. Link them in the footer; mark them with `WebPage` JSON-LD and, for
   contact, `ContactPage`.
3. Move the "Your data" section from terms into the privacy page and link
   between them.

## Acceptance criteria

- `/about`, `/contact`, `/privacy`, `/accessibility` return 200 with ≥ 500
  characters of server-rendered content, canonicals and descriptions.
- Footer links to all four on every page.
- Agent-readiness "trust anchor pages" check passes.

Suggested labels: `enhancement`, `severity:minor`, `subsystem:landing`
