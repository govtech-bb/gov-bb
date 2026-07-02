// Static analytics data for the /analytics page. The numbers live in a JSON
// COMMITTED to the repo (analytics-snapshot.json) and bundled at build time —
// the page never calls Umami at request time, and deploys need no UMAMI_* env.
// Refresh by running `pnpm run generate:analytics` and committing the result.
import type {
  FormDetail,
  FormRow,
  PageRow,
  PresetReport,
  ReportModel,
  SearchReport,
} from '@govtech-bb/umami-analytics'
import snapshot from '../content/analytics-snapshot.json'

// The committed snapshot.json is real data (5 populated presets), refreshed
// manually via `pnpm run generate:analytics`. The cast is only needed because
// resolveJsonModule infers a narrower literal type than ReportModel.
export const REPORT = snapshot as unknown as ReportModel

export type { FormDetail, FormRow, PageRow, PresetReport, SearchReport }
