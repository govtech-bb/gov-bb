// Static analytics data for the /analytics page. The numbers are generated at
// build time by scripts/generate-analytics-snapshot.ts (which does the Umami
// fetching) and baked into this JSON — the page never calls Umami at request
// time. Refreshing the data is a redeploy (see refresh-analytics.yml).
import type {
  FormDetail,
  FormRow,
  PageRow,
  PresetReport,
  ReportModel,
  SearchReport,
} from '@govtech-bb/umami-analytics'
import snapshot from '../content/analytics-snapshot.json'

// The committed snapshot.json is a placeholder (empty presets) the build
// overwrites; cast through unknown since its literal type is narrower.
export const REPORT = snapshot as unknown as ReportModel

export type { FormDetail, FormRow, PageRow, PresetReport, SearchReport }
