# alpha.gov.bb — Landing app

The public-facing landing site for the Government of Barbados service portal, built with TanStack Start.

Sandbox: https://landing.sandbox.alpha.gov.bb

# Getting Started

To run this application:

```bash
pnpm install
pnpm dev
```

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. You can run the tests with:

```bash
pnpm test
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Uninstall the packages: `pnpm remove @tailwindcss/vite tailwindcss`

## Linting & Formatting

This project uses [eslint](https://eslint.org/) and [prettier](https://prettier.io/) for linting and formatting. Eslint is configured using [tanstack/eslint-config](https://tanstack.com/config/latest/docs/eslint). The following scripts are available:

```bash
pnpm lint
pnpm format
pnpm check
```

## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from '@tanstack/react-router'
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')

  useEffect(() => {
    getServerTime().then(setTime)
  }, [])

  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

## Analytics (Umami)

The landing app sends pageview and click events to [Umami Cloud](https://umami.is/) when configured.

### Enabling

Set `VITE_UMAMI_WEBSITE_ID` (and optionally `VITE_UMAMI_SRC`) in the deploy environment. See `apps/landing/.env.example` for the contract. When the variable is unset (including in local `dev`), no script is loaded and no events are sent — keeping dev traffic out of the dataset.

### How it works

- **Script injection** happens at SSR time in `src/routes/__root.tsx`, gated on the env var. The script is loaded with `data-auto-track="false"` so Umami doesn't double-count alongside our manual tracking.
- **Pageviews** fire from `router.subscribe('onResolved', ...)` in `src/router.tsx` — one event per resolved route, including SPA navigations.
- **Click and form-lifecycle events** are tagged via `data-umami-event="..."` attributes (and `data-umami-event-*` for properties) on the relevant elements, plus `trackEvent()` calls from React effects where the event is about state transition (form submit / success / error).
- A typed helper at `src/lib/analytics.ts` (`trackEvent`, `trackPageview`, `deriveStartEventName`) provides a no-op wrapper around `window.umami` so component code doesn't need defensive checks.

### Event-naming conventions

| Pattern              | Example                                                        | Used for                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<surface>-<action>` | `header-home`, `footer-careers`, `feedback-submit`             | Fixed UI elements                                                                                                                                                |
| `service-<slug>`     | `service-renew-passport`                                       | Per-service clicks on `/services` list                                                                                                                           |
| `<slug>-start`       | `renew-passport-start`, `travel-renew-passport-start`          | Slug-prefixed start CTA clicks from a service root page into its `/start` flow (derived automatically by `deriveStartEventName()` from the link href)            |
| `<form_id>-start`    | `get-birth-certificate-start`, `jobstart-plus-programme-start` | Click on a Start now button rendered from a page's `form_id` frontmatter. Keyed on the form actually started, not the page slug — see _Start now buttons_ below. |

The per-service named events let each item show up as its own metric in Umami's dashboard. The `<slug>-start` events measure the conversion from root page to start page and are grouped separately so they're easy to find.

## Start now buttons (cross-app links to the forms app)

Service pages that have a corresponding form in the forms API can render a
**Start now** button that links the user into the forms app at
`/forms/<form_id>`. The wiring is driven by the forms API itself — there
is no hand-maintained mapping file in this repo.

The full architectural rationale is in
[ADR-0005](../../docs/decisions/0005-build-time-manifest-for-cross-app-link-availability.md).

### Authoring

In the markdown for a start page (e.g. `src/content/get-birth-certificate/start.md`):

1. Declare `form_id` in frontmatter. The value must match a `formId` in
   the forms API.
   ```yaml
   ---
   title: 'Get a copy of a birth certificate'
   form_id: get-birth-certificate
   ---
   ```
2. Place a marker anchor anywhere in the body where the button should
   render. No `href`, no scheme — the renderer fills it in.
   ```html
   <a data-start-link>Start now</a>
   ```

You can have zero, one, or several markers per page.

### How it resolves

```
build:   apps/landing/scripts/fetch-form-manifest.mjs
         → fetch ${VITE_FORMS_API_URL}/form-definitions
         → write src/content/available-forms.gen.ts (gitignored)
              export const AVAILABLE_FORMS: ReadonlySet<string>

render:  MarkdownContent reads `form_id` from frontmatter
         → renders <a data-start-link>  only if form_id ∈ AVAILABLE_FORMS
         → button href = ${VITE_FORMS_URL}/forms/${form_id}
         → Umami event = "<form_id>-start"
```

- **Build-time fetch** runs as the `predev` and `prebuild` lifecycle
  script. Every dev start and CI build pulls a fresh manifest. If the
  forms API is unreachable, the build fails — better than silently
  shipping a landing site with no Start now buttons.
- **Frontmatter without API match** — the button is suppressed
  silently in production. In dev, a `console.warn` flags it so authors
  catch typos during review.
- **Marker without `form_id`** in frontmatter — same: silent in prod,
  warn in dev.

### Environment variables

Both are documented in `.env.example`:

| Variable             | When used   | Purpose                                                                                                   |
| -------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `VITE_FORMS_API_URL` | build time  | Where the prebuild script fetches `/form-definitions`. Default: `https://forms.api.sandbox.alpha.gov.bb`. |
| `VITE_FORMS_URL`     | render time | Base URL used in resolved button hrefs. Default: `https://forms.sandbox.alpha.gov.bb`.                    |

Set these per environment in the deploy console (Amplify) to point
sandbox at the sandbox API and prod at the prod API.

### Adding a new Start now button

1. Find the form ID via
   `curl ${VITE_FORMS_API_URL}/form-definitions` — copy the `formId`
   value verbatim.
2. Add `form_id: <that-id>` to the page's frontmatter.
3. Drop `<a data-start-link>Start now</a>` (or `Apply online`, etc.)
   wherever it should appear in the body.
4. Restart `pnpm dev` (or rely on `predev` to regenerate the
   manifest); the button should render.

### Removing or renaming a form on the API side

No landing-app change required. The next build's `predev` fetch will
either drop the form from the manifest (in which case the Start now
button silently disappears) or pick up the new ID (in which case any
content still pointing at the old ID also silently disappears, with a
dev warning).

## Feature flagging: the content rollout gate (`visibility`)

Pages can be hidden from the public while still being reviewable. The
`visibility` frontmatter field has **three hierarchical levels** (the default is
`public`):

| Level     | Seen by the public? | Seen by a `preview` token? | Seen by a `draft` token? |
| --------- | ------------------- | -------------------------- | ------------------------ |
| `public`  | ✅                  | ✅                         | ✅                       |
| `preview` | ❌                  | ✅                         | ✅                       |
| `draft`   | ❌                  | ❌                         | ✅                       |

The levels are ordered `public < preview < draft`: a viewer sees everything at
**or below** the level their token grants. So a `draft` reviewer also sees
`preview` and `public` content, and a `preview` reviewer also sees `public`
content — but **`draft` content is hidden even from `preview` reviewers**. Use
`draft` for content that isn't ready for the wider review audience yet; use
`preview` for content that's ready to review but not to publish.

```yaml
---
title: 'Register as a private CSEC candidate'
category: education
visibility: draft # or: preview
---
```

A gated (`preview` or `draft`) page 404s for anyone below its level, is dropped
from search and category listings for them, and carries `robots: noindex`.
Because a category's visibility is **derived** from its pages (a category is
shown only if it has at least one service the viewer can see), flagging every
page in a category also hides the category itself — `/education` disappears from
the homepage and 404s when there are no education services left at the viewer's
level. Gating a service's `index.md` cascades to its `/start` and `/form`
sub-pages too.

> [!IMPORTANT]
> Like `preview`, `draft` is a **rollout gate, not a confidentiality
> boundary** — the content still ships in the client bundle and is downloadable
> by anyone who inspects it (see
> `docs/decisions/0013-content-preview-is-a-rollout-gate-not-a-confidentiality-boundary.md`).
> `draft` only sits one rung above `preview`; it is **not** for embargoed or
> sensitive material.

### Viewing a gated page

Each level is unlocked by its own token, matching a server-only env var (never
`VITE_`-prefixed, so neither is shipped to the browser):

- `?preview=<PREVIEW_SECRET>` grants the `preview` level,
- `?draft=<DRAFT_SECRET>` grants the `draft` level.

1. Visit **any** URL with the token appended, e.g.
   `https://landing.sandbox.alpha.gov.bb/education?draft=THE_DRAFT_SECRET`.
2. On a match the server sets an httpOnly `preview` cookie holding only the
   granted **level** (never the secret) and redirects to the same path with the
   token stripped (so the secret never lingers in the URL or browser history).
   From then on the whole session sees content at that level — hidden pages
   render, and hidden categories reappear in listings and search.

A wrong token is simply stripped from the URL, leaving any existing grant
intact.

> [!IMPORTANT]
> `PREVIEW_SECRET` and `DRAFT_SECRET` **must be different values**. The whole
> point of `draft` is that it's hidden from `preview` reviewers — and those
> reviewers know the preview secret. If the two secrets matched, a preview
> reviewer could reach draft content just by swapping `?preview=` for `?draft=`.

### Exiting

Visit `?preview=exit` (or `?draft=exit`) on any URL. This clears the cookie and
redirects **home** — not back to the current page, which may be gated and would
otherwise 404 once the grant is gone.

### Environment variables

| Variable         | When used | Purpose                                                                                                                                  |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PREVIEW_SECRET` | run time  | The token reviewers append as `?preview=<value>` to unlock `preview`. Server-only. When unset, no preview token works.                   |
| `DRAFT_SECRET`   | run time  | The token reviewers append as `?draft=<value>` to unlock `draft`. Server-only, and **must differ** from `PREVIEW_SECRET`. When unset, no draft token works. |

Set them per environment in the deploy console (Amplify) — or, locally, in
`apps/landing/.env`:

```bash
PREVIEW_SECRET=some-local-preview-secret
DRAFT_SECRET=some-other-local-draft-secret
pnpm dev
# then visit http://localhost:3000/...?draft=some-other-local-draft-secret
```

The implementation lives in `src/lib/preview.ts` (token check, cookie, redirect)
and is resolved once per request in `src/routes/__root.tsx`. The level
comparison and per-page gating live in `src/content/registry.ts`.

## Chat handoff (ChatAssistant)

The `ChatAssistant` component on the homepage probes the chat app's
`/api/health/public` for the live Online badge and, on submit, redirects
to the chat app with the user's question prefilled via `?q=` so chat
auto-sends on mount.

### Environment variable

| Variable        | When used   | Purpose                                                                                  |
| --------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `VITE_CHAT_URL` | build time  | Base URL of the deployed chat app. Used for both the health probe and the submit handoff. |

`ChatAssistant` defaults to `https://chat.sandbox.alpha.gov.bb` in code
when `VITE_CHAT_URL` is unset, so deploys work with no Amplify Console
config.

To override (e.g. run landing locally against a localhost chat instance,
or point a build at a different chat deploy), set `VITE_CHAT_URL`
explicitly:

- **Local**: add `VITE_CHAT_URL=http://localhost:3001` to
  `apps/landing/.env.local`.
- **Amplify**: App settings → Environment variables → add
  `VITE_CHAT_URL=<url>`. **Then trigger a rebuild** — the value is baked
  at build time, not read at runtime (Amplify Hosting Compute doesn't
  reliably pass env to the SSR Lambda at runtime, so the whole repo bakes
  config at build).

### Why build-time, not runtime

The SSR bundle runs in a Lambda where `process.env.*` reads are not
reliably populated by Amplify. `apps/chat/src/config/env.ts` documents
the same constraint. Treat changing this URL as a deploy: set the var,
rebuild, ship.

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
