import type { PageResponse } from './api-v2-page'

/**
 * `GET /pages` responses for the conductor's licence service page and its
 * `/start` page, shaped as api_v2's `toPublicPage` returns them
 * (apps/api_v2/src/modules/page-visibility.ts). The bodies keep only the
 * Start links: the service page's "Apply online" link, which has an href and
 * so carries no Umami event, and the start page's "Start now" button, which
 * sends `<form_id>-start`. The test checks the category, form and Start links
 * against api_v2's seed snapshot.
 */

const SERVICE_URL = '/work-employment/apply-for-conductor-licence'
const TITLE = "Apply for a conductor's licence"
const CATEGORY_CRUMB = { name: 'Work and employment', url: '/work-employment' }

export const SERVICE_PAGE: PageResponse = {
  url: SERVICE_URL,
  frontmatter: {
    title: TITLE,
    description:
      "Apply for a conductor's licence to work on a Public Service Vehicle (PSV) in Barbados. You must be 18 years or older to apply.",
    stage: 'alpha',
    service_type: 'digital',
  },
  body_markdown: [
    'If you are 18 years old or older, you can use this service to apply for a licence to become a conductor on a Public Service Vehicle (PSV).',
    '## How to apply',
    `<a data-start-link href="${SERVICE_URL}/start">Apply online</a>`,
  ].join('\n\n'),
  form_id: 'apply-for-conductor-licence',
  hide_start_links: false,
  breadcrumbs: [CATEGORY_CRUMB, { name: TITLE, url: SERVICE_URL }],
  published_at: '2026-03-06T00:00:00.000Z',
  content_updated_at: '2026-03-06T00:00:00.000Z',
  updated_at: '2026-03-06T00:00:00.000Z',
  category: 'work-employment',
  subcategory: null,
  visibility: 'public',
}

export const START_PAGE: PageResponse = {
  ...SERVICE_PAGE,
  url: `${SERVICE_URL}/start`,
  frontmatter: { title: TITLE, stage: 'alpha' },
  body_markdown: [
    'You should complete your application in one go.',
    '<a data-start-link>Start now</a>',
  ].join('\n\n'),
  breadcrumbs: [
    CATEGORY_CRUMB,
    { name: TITLE, url: SERVICE_URL },
    { name: TITLE, url: `${SERVICE_URL}/start` },
  ],
}
