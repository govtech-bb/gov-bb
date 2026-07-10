// Emits SQL that seeds `service_status` from the CURRENT content + forms state.
// Source of truth = landing markdown; form visibility via the recipe's
// meta.visibility (default "preview", matching getRecipeVisibility). Mapping:
//   - content visibility preview | draft            -> disabled
//   - public page + form visibility preview | maint -> form_disabled
//   - otherwise                                      -> enabled
// Rows are keyed by the canonical slug the platform reconciles on: formId when
// the service has a form, else the content slug.
//
// The SQL is IDEMPOTENT and NON-DESTRUCTIVE: it INSERTs with ON CONFLICT (slug)
// DO NOTHING, so it only creates rows for services that have no row yet and
// never overwrites an existing status (i.e. it won't clobber runtime toggles).
// A `content-seed` audit entry is written for each newly-inserted row only.
//
// Usage — review the SQL, then apply to the target database:
//   pnpm seed:service-status                       # print SQL
//   pnpm seed:service-status | psql "$DATABASE_URL"
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "@govtech-bb/content";

type Status = "enabled" | "form_disabled" | "disabled";

const RECIPES_DIR = join(
  "apps",
  "api",
  "src",
  "forms",
  "form-definitions",
  "recipes",
);

function formVisibility(formId: string): string {
  try {
    const json = JSON.parse(
      readFileSync(join(RECIPES_DIR, `${formId}.json`), "utf8"),
    ) as { meta?: { visibility?: string } };
    return json.meta?.visibility ?? "preview";
  } catch {
    return "preview"; // no recipe file → treat as not-yet-launched
  }
}

function statusFor(cv: string, formId: string | undefined): Status {
  if (cv === "preview" || cv === "draft") return "disabled";
  if (formId) {
    const fv = formVisibility(formId);
    if (fv === "preview" || fv === "maintenance") return "form_disabled";
  }
  return "enabled";
}

const PRECEDENCE: Record<Status, number> = {
  enabled: 0,
  form_disabled: 1,
  disabled: 2,
};

async function main() {
  const { services, warnings } = await loadContent();
  for (const w of warnings) console.error(`[warn] ${w}`);

  const bySlug = new Map<string, Status>();
  for (const s of services) {
    const cv = s.visibility ?? "public";
    const formId = s.form_id && s.form_id.length > 0 ? s.form_id : undefined;
    const status = statusFor(cv, formId);
    const slug = formId ?? s.slug;
    const existing = bySlug.get(slug);
    if (!existing || PRECEDENCE[status] > PRECEDENCE[existing]) {
      bySlug.set(slug, status);
    }
  }

  const rows = [...bySlug.entries()].sort(([a], [b]) => a.localeCompare(b));
  const esc = (v: string) => `'${v.replace(/'/g, "''")}'`;

  const lines: string[] = ["BEGIN;"];
  if (rows.length > 0) {
    const values = rows
      .map(
        ([slug, st]) => `    (${esc(slug)}, ${esc(st)}::service_status_enum)`,
      )
      .join(",\n");
    lines.push(
      "WITH seed(slug, status) AS (\n  VALUES\n" + values + "\n),",
      "inserted AS (",
      "  INSERT INTO service_status (slug, status)",
      "  SELECT slug, status FROM seed",
      "  ON CONFLICT (slug) DO NOTHING",
      "  RETURNING slug, status",
      ")",
      "INSERT INTO service_status_audit_log (slug, old_state, new_state, author)",
      "SELECT slug, NULL, status, 'content-seed' FROM inserted;",
    );
  }
  lines.push("COMMIT;");
  console.log(lines.join("\n"));

  const counts = rows.reduce<Record<string, number>>((acc, [, st]) => {
    acc[st] = (acc[st] ?? 0) + 1;
    return acc;
  }, {});
  console.error(`[seed] ${rows.length} services: ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
