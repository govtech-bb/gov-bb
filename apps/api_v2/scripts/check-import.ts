/**
 * After an estate import, proves the API serves every snapshot page at the
 * level this environment should have (#3235): frontmatter, overlaid with the
 * environment's `service_status` (#3188), made as hidden as any ancestor.
 *
 * `PREVIEW_SECRET=… tsx scripts/check-import.ts --base-url <api_v2> --forms-api <api v1>`
 *
 * The secret comes from the environment only and is never printed.
 */

import { parseArgs } from "node:util";
import type { Visibility } from "../src/modules/page";
import {
  ServiceStatuses,
  applyServiceStatuses,
} from "../src/modules/service-status";
import { PREVIEW_TOKEN } from "../src/routes/site";
import { ESTATE, ESTATE_SOURCE } from "../src/seed-data";

const LEVELS: readonly Visibility[] = ["public", "preview", "draft"];

/** Expected status per request: [no token, with token]. */
const MATRIX: Record<Visibility, [number, number]> = {
  public: [200, 200],
  preview: [404, 200],
  draft: [404, 404],
};

class Stop extends Error {}

async function main() {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      "forms-api": { type: "string" },
    },
  });
  const baseUrl = values["base-url"]?.replace(/\/+$/, "");
  const formsApi = values["forms-api"]?.replace(/\/+$/, "");
  const secret = process.env.PREVIEW_SECRET;
  if (!baseUrl || !formsApi) {
    throw new Stop(
      "--base-url <api_v2 origin> and --forms-api <api v1 origin> are required",
    );
  }
  if (!secret) throw new Stop("PREVIEW_SECRET is not set in the environment");

  // Same read as import-estate.ts.
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

  // api_v2's read-time rule: a page is as hidden as anything above it.
  const { pages } = applyServiceStatuses(ESTATE.pages, statuses);
  const own = new Map(pages.map((page) => [page.url, page]));
  const expected = (url: string | null): Visibility => {
    const page = url ? own.get(url) : undefined;
    if (!page) return "public";
    const above = expected(page.parent);
    return LEVELS.indexOf(above) > LEVELS.indexOf(page.visibility)
      ? above
      : page.visibility;
  };

  const totals = new Map(
    LEVELS.map((level) => [level, { pages: 0, failing: 0 }]),
  );
  // ponytail: sequential (~250 requests, well inside the 1,000/min limit);
  // cap ~8 in flight if a run takes over a minute.
  for (const page of pages) {
    const level = expected(page.url);
    const results: string[] = [];
    let ok = true;
    for (const [i, token] of [undefined, secret].entries()) {
      const want = MATRIX[level][i];
      const got = await read(baseUrl, page.url, token);
      if (got.status === 401 && token) {
        throw new Stop(
          `preview token refused by ${baseUrl}: PREVIEW_SECRET is wrong, or unset on the API`,
        );
      }
      if (got.status === 429) throw new Stop(`rate limited by ${baseUrl}`);
      const problem = got.status === 200 ? bodyProblem(got.body, level) : null;
      if (got.status !== want || problem) ok = false;
      results.push(
        `${token ? "token" : "no token"} ${got.status}${problem ? ` (${problem})` : ""}`,
      );
    }
    const total = totals.get(level)!;
    total.pages++;
    if (!ok) {
      total.failing++;
      console.log(`FAIL ${page.url} expected ${level}: ${results.join(", ")}`);
    }
  }

  let failing = 0;
  for (const [level, total] of totals) {
    console.log(`${level}: ${total.pages} pages, ${total.failing} failing`);
    failing += total.failing;
  }
  console.log(
    `${failing} failing of ${pages.length} pages in snapshot ${ESTATE_SOURCE}`,
  );
  process.exitCode = failing ? 1 : 0;
}

/** One `GET /pages?url=`; a network error comes back as status `ERR …`. */
async function read(
  baseUrl: string,
  url: string,
  token: string | undefined,
): Promise<{ status: number | string; body?: unknown }> {
  try {
    const response = await fetch(
      `${baseUrl}/pages?url=${encodeURIComponent(url)}`,
      {
        headers: token ? { [PREVIEW_TOKEN]: token } : {},
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = response.status === 200 ? await response.json() : undefined;
    return { status: response.status, body };
  } catch (error) {
    return { status: `ERR ${(error as Error).message}` };
  }
}

/** What is wrong with a 200 body, or null. */
function bodyProblem(body: unknown, level: Visibility): string | null {
  const page = body as {
    frontmatter?: { title?: unknown };
    body_markdown?: unknown;
    visibility?: unknown;
  };
  if (typeof page?.frontmatter?.title !== "string" || !page.frontmatter.title)
    return "no title";
  if (typeof page.body_markdown !== "string") return "no body_markdown";
  if (page.visibility !== level) return `visibility ${String(page.visibility)}`;
  return null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Stop ? error.message : error);
  process.exitCode = 1;
});
