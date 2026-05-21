/**
 * Maps start-page slugs to formIds served by the forms API.
 *
 * Used by the Markdown anchor handler to resolve `form:<slug>` hrefs to
 * `/forms/<formId>`. When sandbox IDs are replaced with prod IDs, edit
 * the values here — no content changes needed.
 */
const FORMS_BASE_URL = import.meta.env.VITE_FORMS_URL ?? 'http://localhost:3000'

export const FORM_IDS: Record<string, string> = {
  'apply-for-conductor-licence': 'apply-for-conductor-licence-test',
  'apply-to-be-a-project-protege-mentor': 'project-protege-mentor-test',
  'apply-to-jobstart-plus-programme': 'jobstart-plus-programme-test',
  'apply-to-the-barbados-youthadvance-corps': 'youthadvance-corps-recruitment',
  'get-birth-certificate': 'get-birth-certificate-test',
  'get-death-certificate': 'get-death-certificate-test',
  'get-marriage-certificate': 'get-marriage-certificate-test',
  'post-office-redirection-business': 'post-office-redirection-business-test',
  'post-office-redirection-deceased': 'post-office-redirection-deceased-test',
  'post-office-redirection-individual':
    'post-office-redirection-individual-test',
  'register-for-community-sports-training-programme':
    'community-sports-training-test',
  'register-summer-camp': 'national-summer-camp-2025-registration',
  'sell-goods-services-beach-park': 'sell-goods-services-beach-park-test',
}

export function resolveFormHref(slug: string): string {
  const formId = FORM_IDS[slug]
  if (!formId) {
    throw new Error(
      `Unknown form slug "${slug}". Add it to apps/landing/src/content/form-ids.ts.`,
    )
  }
  return `${FORMS_BASE_URL}/forms/${formId}`
}
