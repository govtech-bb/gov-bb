import type { ReactNode } from 'react'
import { Heading, Text } from '@govtech-bb/react'
import { CHAT_URL } from '../lib/chat-url'
import { TRACKER_URL } from '../lib/tracker-url'
import { trackEvent } from '../lib/analytics'

/**
 * The "Featured" column on the homepage (Figma 7923:165).
 *
 * Three shortcuts to things people arrive wanting to do, beside the full
 * service list rather than buried in it.
 *
 * ── Why this is not ServiceList ────────────────────────────────────────────
 * `ServiceList` / `ServiceListItem` give the bold green link and description for
 * free and were the first thing tried. They do not carry the design's coloured
 * icon tile, and their items are separated by rules where the Featured column is
 * separated by space. Rather than fight the component, the link keeps the design
 * system's own `govbb-link` styling and the tile is built here.
 *
 * ── Icons ─────────────────────────────────────────────────────────────────
 * Chat and calendar are the exact paths exported from the Figma, refilled with
 * `currentColor` so the tile sets the colour from a token instead of the hex
 * baked into the export.
 *
 * The tracker's icon is a document rather than the frame's clipboard-and-tick,
 * which read as "completed" rather than "something to check on". Requested
 * change, so it departs from the frame deliberately.
 *
 * It is filled, like the other two, using `evenodd` to punch the lines out of a
 * solid page rather than stroking an outline — so all three icons read at the
 * same weight in their tiles.
 *
 * ── Sizes ─────────────────────────────────────────────────────────────────
 * The link is `govbb-text-body` (20px), not the `body-lg` (24px) the service
 * links on the left use — the design deliberately makes these smaller than the
 * category list beside them. Getting that wrong made the whole column 7px taller
 * than the frame.
 *
 * ── Two colours had no token ──────────────────────────────────────────────
 * The Bank holidays tile is `#e8f4ec` in the design and its icon `#0b6b3a`;
 * neither is in the scale. The nearest steps are used — `green-10` (`#e9f9f3`)
 * and `green-80` (`#00654a`) — rather than hard-coding a one-off, which is what
 * the design system's guidance asks for. Worth raising if the difference is
 * deliberate.
 */

function IconChat() {
  return (
    <svg
      aria-hidden="true"
      className="size-[26px] shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 26 26"
    >
      <path
        d="M4.33333 3.25H21.6667C22.2413 3.25 22.7924 3.47827 23.1987 3.8846C23.6051 4.29093 23.8333 4.84203 23.8333 5.41667V16.25C23.8333 16.8246 23.6051 17.3757 23.1987 17.7821C22.7924 18.1884 22.2413 18.4167 21.6667 18.4167H9.75L4.33333 22.75V5.41667C4.33333 4.84203 4.56161 4.29093 4.96793 3.8846C5.37426 3.47827 5.92536 3.25 6.5 3.25H4.33333ZM7.58333 8.66667H18.4167V10.8333H7.58333V8.66667ZM7.58333 13H15.1667V15.1667H7.58333V13Z"
        fill="currentColor"
      />
    </svg>
  )
}

function IconDocument() {
  return (
    <svg
      aria-hidden="true"
      className="size-[26px] shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      {/*
        Solid page with a cut corner and three lines punched out. `evenodd` is
        what turns the bars into holes rather than more filled shape — the same
        construction the Figma exports use, so it sits at the same visual weight
        as the chat and calendar icons beside it.
      */}
      <path
        clipRule="evenodd"
        d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 6h3v2H8V8zm0 4h8v2H8v-2zm0 4h8v2H8v-2z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg
      aria-hidden="true"
      className="size-[26px] shrink-0"
      fill="none"
      focusable="false"
      viewBox="0 0 26 26"
    >
      <path
        d="M7.58333 2.16667V4.33333H18.4167V2.16667H20.5833V4.33333H21.6667C22.2413 4.33333 22.7924 4.56161 23.1987 4.96793C23.6051 5.37426 23.8333 5.92536 23.8333 6.5V21.6667C23.8333 22.2413 23.6051 22.7924 23.1987 23.1987C22.7924 23.6051 22.2413 23.8333 21.6667 23.8333H4.33333C3.7587 23.8333 3.2076 23.6051 2.80127 23.1987C2.39494 22.7924 2.16667 22.2413 2.16667 21.6667V6.5C2.16667 5.92536 2.39494 5.37426 2.80127 4.96793C3.2076 4.56161 3.7587 4.33333 4.33333 4.33333H5.41667V2.16667H7.58333ZM4.33333 10.8333V21.6667H21.6667V10.8333H4.33333ZM7.58333 13H11.9167V17.3333H7.58333V13Z"
        fill="currentColor"
      />
    </svg>
  )
}

interface FeaturedLink {
  href: string
  title: string
  description: string
  /** Background of the icon tile, and the colour the icon inherits. */
  tileClassName: string
  icon: ReactNode
  event: string
}

const FEATURED: FeaturedLink[] = [
  {
    href: CHAT_URL,
    title: 'Ask the assistant',
    description:
      'Get a guided answer about any government service, in your own words.',
    tileClassName: 'bg-teal-10 text-teal-80',
    icon: <IconChat />,
    event: 'featured-assistant',
  },
  {
    href: TRACKER_URL,
    title: 'Track your application',
    description: 'Check the status of something you have already applied for.',
    tileClassName: 'bg-blue-10 text-blue-40',
    icon: <IconDocument />,
    event: 'featured-tracker',
  },
  {
    href: '/bank-holiday-calendar',
    title: 'Bank holidays',
    description:
      'See the public holidays and substitution days for the year ahead.',
    tileClassName: 'bg-green-10 text-green-80',
    icon: <IconCalendar />,
    event: 'featured-bank-holidays',
  },
]

export function Featured() {
  return (
    <section aria-labelledby="featured-heading" className="space-y-m">
      <Heading as="h2" id="featured-heading">
        Featured
      </Heading>

      <ul className="m-0 flex list-none flex-col gap-m p-0">
        {FEATURED.map((item) => (
          <li className="flex gap-s" key={item.href}>
            <span
              aria-hidden="true"
              className={`flex size-14 shrink-0 items-center justify-center rounded-sm ${item.tileClassName}`}
            >
              {item.icon}
            </span>
            <div className="space-y-xxs [--govbb-link-color:var(--govbb-color-tertiary)]">
              <a
                className="govbb-link govbb-text-body govbb-text-bold"
                href={item.href}
                onClick={() => trackEvent(item.event)}
              >
                {item.title}
              </a>
              <Text as="p" className="text-grey-80" size="body-sm">
                {item.description}
              </Text>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
