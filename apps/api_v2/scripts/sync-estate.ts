/**
 * Fixes the drift `check-import --json` found between the estate snapshot and
 * a deployed api_v2, through the editor API, so each change is recorded
 * against the operator (#3711). For use only before the environment's
 * cutover: after it, the database is the source of truth (ADR 0129).
 *
 * `EDITOR_SESSION=… tsx scripts/sync-estate.ts --base-url <api_v2> --editor-origin <editor_v2> --forms-api <api v1> --differences <file> [--apply]`
 *
 * One row per snapshot page, then one per page only api_v2 has:
 * - `update`: the check found a field difference. A PUT writes the
 *   snapshot's fields and keeps the page's visibility. On a public page that
 *   is a pending revision, which the script submits, so an approver other
 *   than the operator publishes it (ADR 0134).
 * - `create`: api_v2 has no page at the url. It is created at its snapshot
 *   visibility after the service_status overlay; a public one as preview,
 *   because nobody may create a page public that they wrote.
 * - `conflict`: anyone but `system` changed the page, it has a pending
 *   revision, or api_v2 has the url but doesn't serve it or can't give its
 *   id. It is left as it is.
 * - `unchanged`.
 * - `removed`: api_v2 serves it and the snapshot lacks it. Never deleted.
 * - `failed`: api_v2 refused a request.
 * With `--apply`, `update` and `create` print as `updated` and `created`.
 *
 * A dry run by default: it only reads. The session comes from the
 * environment only and is never printed.
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Difference } from "../src/modules/estate-drift";
import { Visibility } from "../src/modules/page";
import {
  ServiceStatuses,
  applyServiceStatuses,
} from "../src/modules/service-status";
import { ESTATE, ESTATE_SOURCE, type SeedPage } from "../src/seed-data";

class Stop extends Error {}

/** api_v2 answered a request with an error, or not at all. */
class Refused extends Error {}

const CheckOutput = z.object({
  source: z.string(),
  differences: z.array(Difference),
});

const Ref = z.object({ id: z.string(), url: z.string() });
const Saved = z.object({
  id: z.string(),
  version: z.number(),
  visibility: Visibility,
  pending_revision: z.object({ status: z.string() }).nullable(),
});

const STATUSES = [
  "updated",
  "created",
  "conflict",
  "unchanged",
  "removed",
  "failed",
] as const;
type Status = (typeof STATUSES)[number];

async function main() {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      "editor-origin": { type: "string" },
      "forms-api": { type: "string" },
      differences: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const baseUrl = values["base-url"]?.replace(/\/+$/, "");
  const editorOrigin = values["editor-origin"]?.replace(/\/+$/, "");
  const formsApi = values["forms-api"]?.replace(/\/+$/, "");
  const apply = values.apply;
  if (!baseUrl || !editorOrigin || !formsApi || !values.differences) {
    throw new Stop(
      "--base-url <api_v2 origin>, --editor-origin <editor_v2 origin>, --forms-api <api v1 origin> and --differences <check-import --json output> are required",
    );
  }
  const session = process.env.EDITOR_SESSION;
  if (!session) throw new Stop("EDITOR_SESSION is not set in the environment");
  // fetch quotes a header value it refuses in its error, so refuse it first.
  if (!/^[\x20-\x7e]+$/.test(session)) {
    throw new Stop(
      "EDITOR_SESSION has a character a header can't carry, such as a line break: copy it again",
    );
  }

  let check;
  try {
    check = CheckOutput.parse(
      JSON.parse(readFileSync(values.differences, "utf8")),
    );
  } catch (error) {
    throw new Stop(
      `--differences: not check-import --json output (${(error as Error).message.split("\n")[0]})`,
    );
  }
  if (check.source !== ESTATE_SOURCE) {
    throw new Stop(
      `--differences is from snapshot ${check.source}, but this checkout's is ${ESTATE_SOURCE}: run check-import and sync-estate from the same checkout`,
    );
  }

  /** One editor API call; a 2xx body parsed with `schema`, else `Refused`. */
  async function call<T>(
    schema: z.ZodType<T>,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          cookie: session!,
          origin: editorOrigin!,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new Refused(`${method} ${path}: ${(error as Error).message}`);
    }
    if (response.status === 401) {
      throw new Stop(
        `${baseUrl} refused EDITOR_SESSION: sign in to the editor again and copy a fresh session`,
      );
    }
    const json: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const { error, message } = (json ?? {}) as {
        error?: string;
        message?: string;
      };
      throw new Refused(
        `${method} ${path}: ${response.status} ${error ?? ""} ${message ?? ""}`.trim(),
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new Refused(`${method} ${path}: unexpected body`);
    return parsed.data;
  }

  /** A read the run can't go on without. */
  const need = <T>(schema: z.ZodType<T>, path: string) =>
    call(schema, "GET", path).catch((error: unknown) => {
      throw error instanceof Refused ? new Stop(error.message) : error;
    });

  const me = await need(
    z.object({ email: z.string(), roles: z.array(z.string()) }),
    "/editor/me",
  );
  if (!me.roles.includes("editor")) {
    throw new Stop(
      `${me.email} lacks the editor role, which every write needs`,
    );
  }
  console.log(
    `${apply ? "Applying" : "Dry run: nothing is written"}. Snapshot ${ESTATE_SOURCE}, signed in as ${me.email}.`,
  );

  // Same read as import-estate.ts: what visibility a new page gets.
  const statusUrl = `${formsApi}/service_status`;
  let statuses;
  try {
    const response = await fetch(statusUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    statuses = ServiceStatuses.parse(await response.json());
  } catch (error) {
    const { message, cause } = error as Error;
    const why = cause instanceof Error ? ` (${cause.message})` : "";
    throw new Stop(`service_status: ${message}${why} from ${statusUrl}`);
  }
  const { pages } = applyServiceStatuses(ESTATE.pages, statuses);

  // Every page's id by url, drafts included: each service's pages, and the
  // uncategorised root pages, which belong to no service.
  const ids = new Map<string, string>();
  for (const service of await need(z.array(Ref), "/services")) {
    const detail = await need(
      z.object({ pages: z.array(Ref) }),
      `/services/${service.id}`,
    );
    for (const page of detail.pages) ids.set(page.url, page.id);
  }
  const site = await need(
    z.object({ pages: z.array(Ref) }),
    "/editor/site-pages",
  );
  for (const page of site.pages) ids.set(page.url, page.id);
  // Every stored url, so a page the indexes above miss is never created twice.
  const paths = new Set(await need(z.array(z.string()), "/editor/page-paths"));
  const categories = new Map(
    (
      await need(
        z.object({
          categories: z.array(z.object({ id: z.string(), slug: z.string() })),
        }),
        "/editor/categories",
      )
    ).categories.map((category) => [category.slug, category.id]),
  );

  const changed = new Map<string, string[]>();
  const missing = new Set<string>();
  const removed: string[] = [];
  for (const difference of check.differences) {
    if (difference.kind === "field") {
      changed.set(difference.url, [
        ...(changed.get(difference.url) ?? []),
        difference.field,
      ]);
    } else if (difference.kind === "missing") {
      missing.add(difference.url);
    } else {
      removed.push(difference.url);
    }
  }

  const counts = new Map<Status, number>(STATUSES.map((s) => [s, 0]));
  const row = (status: Status, url: string, detail?: string) => {
    counts.set(status, counts.get(status)! + 1);
    const word =
      apply || (status !== "updated" && status !== "created")
        ? status
        : status.slice(0, -1);
    console.log(`${word} ${url}${detail ? `: ${detail}` : ""}`);
  };

  /** The snapshot's fields, with its category and parent as api_v2's ids. */
  const fieldsOf = (page: SeedPage) => {
    const categoryId = page.category ? categories.get(page.category) : null;
    if (categoryId === undefined) {
      throw new Refused(`category ${page.category} is not in api_v2`);
    }
    const parentId = page.parent ? ids.get(page.parent) : null;
    if (parentId === undefined) {
      throw new Refused(`parent ${page.parent} is not in api_v2`);
    }
    return {
      url: page.url,
      category_id: categoryId,
      parent_id: parentId,
      title: page.title,
      description: page.description,
      form_id: page.form_id,
      body_markdown: page.body_markdown,
      frontmatter: page.frontmatter,
    };
  };

  let submitted = 0;
  async function update(page: SeedPage, id: string, fields: string[]) {
    // The page before its history: a save between the two reads moves its
    // version, so the PUT is refused rather than overwriting it.
    const current = await call(Saved, "GET", `/pages/${id}`);
    const history = await call(
      z.object({
        entries: z.array(
          z.object({ actor: z.string(), actor_name: z.string().nullable() }),
        ),
      }),
      "GET",
      `/pages/${id}/history`,
    );
    const editors = new Set(
      history.entries
        .filter((entry) => entry.actor !== "system")
        .map((entry) => entry.actor_name ?? entry.actor),
    );
    if (editors.size > 0) {
      return row("conflict", page.url, `changed by ${[...editors].join(", ")}`);
    }
    if (current.pending_revision) {
      return row(
        "conflict",
        page.url,
        `has a ${current.pending_revision.status} revision`,
      );
    }
    const isPublic = current.visibility === "public";
    const body = {
      ...fieldsOf(page),
      visibility: current.visibility,
      expected_version: current.version,
    };
    const what = `${fields.join(", ")}${isPublic ? ", waiting for approval" : ""}`;
    if (!apply) return row("updated", page.url, what);
    const saved = await call(Saved, "PUT", `/pages/${id}`, body);
    if (saved.version === current.version) {
      return row("unchanged", page.url, "api_v2 already has these fields");
    }
    if (isPublic) {
      try {
        await call(z.unknown(), "POST", `/pages/${id}/revision/submit`, {
          expected_version: saved.version,
        });
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
        throw new Refused(
          `saved as a draft revision, but not submitted (${error.message}): submit it in the editor`,
        );
      }
      submitted++;
    }
    row("updated", page.url, what);
  }

  const makePublic: string[] = [];
  async function create(page: SeedPage) {
    const visibility =
      page.visibility === "public" ? "preview" : page.visibility;
    const body = { ...fieldsOf(page), visibility };
    const what =
      visibility === page.visibility
        ? visibility
        : "preview, until an approver makes it public";
    if (apply) {
      ids.set(page.url, (await call(Saved, "POST", "/pages", body)).id);
    } else {
      // Its children can be created after it.
      ids.set(page.url, "(new)");
    }
    if (page.visibility === "public") makePublic.push(page.url);
    row("created", page.url, what);
  }

  const run = async (page: SeedPage, step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      row("failed", page.url, error.message);
    }
  };

  const toCreate: SeedPage[] = [];
  const toUpdate: [SeedPage, string, string[]][] = [];
  for (const page of pages) {
    const id = ids.get(page.url);
    const fields = changed.get(page.url);
    if (id === undefined && paths.has(page.url)) {
      row(
        "conflict",
        page.url,
        "api_v2 has this url, but not where this script looks for pages; check it in the editor",
      );
    } else if (id === undefined) {
      toCreate.push(page);
    } else if (missing.has(page.url)) {
      row(
        "conflict",
        page.url,
        "api_v2 has it but doesn't serve it: its visibility, or a page above it, differs from the snapshot",
      );
    } else if (fields) {
      toUpdate.push([page, id, fields]);
    } else {
      row("unchanged", page.url);
    }
  }
  // Creates first, so an update can move a page under a new one; parents
  // before their sub-pages.
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const depth = (page: SeedPage): number => {
    const parent = page.parent ? byUrl.get(page.parent) : undefined;
    return parent ? 1 + depth(parent) : 0;
  };
  toCreate.sort((a, b) => depth(a) - depth(b));
  for (const page of toCreate) await run(page, () => create(page));
  for (const [page, id, fields] of toUpdate) {
    await run(page, () => update(page, id, fields));
  }

  for (const url of removed) {
    row(
      "removed",
      url,
      "api_v2 serves it and the snapshot doesn't have it; not deleted",
    );
  }

  console.log(
    STATUSES.map(
      (status) =>
        `${counts.get(status)} ${apply || (status !== "updated" && status !== "created") ? status : `to ${status.slice(0, -1)}`}`,
    ).join(", "),
  );
  if (makePublic.length > 0) {
    console.log(
      `An approver other than ${me.email} must make public: ${makePublic.join(", ")}`,
    );
  }
  if (apply) {
    const queue = await need(
      z.object({ revisions: z.array(z.unknown()) }),
      "/revisions?status=submitted",
    );
    console.log(
      `${queue.revisions.length} revisions waiting for approval, ${submitted} from this run`,
    );
  } else {
    console.log(
      "Dry run: nothing was written. Pass --apply to make these changes.",
    );
  }
  process.exitCode = counts.get("failed") ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Stop ? error.message : error);
  process.exitCode = 1;
});
