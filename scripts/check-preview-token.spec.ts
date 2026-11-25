import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { checkPreviewToken, type Targets } from "./check-preview-token";

const TOKEN = "ci-token-0123456789abcdef";
const OTHER = "other-token-fedcba9876543210";

/** The value each stub system holds, and how it misbehaves. */
interface Env {
  apiV1: string;
  apiV2: string;
  landing: string;
  /** What landing's public pages send as x-content-source; none when unset. */
  landingSource?: "api_v2" | "static" | "static-fallback";
  /** x-content-source of the second public page; landingSource when unset. */
  secondSource?: "api_v2" | "static";
  /** Overrides the x-content-source of landing's reviewer read. */
  reviewerSource?: string;
  /** A system that serves its preview item to everyone. */
  leaks?: "api_v2" | "api v1" | "landing";
  /** Landing drops the connection on `?preview=`. */
  dropsGrant?: boolean;
}

let env: Env;
let server: Server;
let targets: Targets;

/**
 * One local server stands in for all three systems: api v1 under /v1,
 * api_v2 under /v2 and landing under /site, each answering only the routes
 * and headers the real one uses for previews.
 */
function handle(url: URL, headers: Record<string, string | undefined>) {
  const sentV2 = headers["x-preview-token"];
  if (url.pathname.startsWith("/v2/")) {
    if (sentV2 !== undefined && sentV2 !== env.apiV2)
      return { status: 401, body: { error: "invalid_preview_token" } };
    const reviewer = sentV2 !== undefined;
    if (url.pathname === "/v2/catalog") {
      const pages = [
        { url: "/a", visibility: "public" },
        { url: "/b", visibility: "public" },
      ];
      if (reviewer) pages.push({ url: "/p", visibility: "preview" });
      return { status: 200, body: { pages } };
    }
    const page = url.searchParams.get("url");
    if (
      page === "/a" ||
      (page === "/p" && (reviewer || env.leaks === "api_v2"))
    )
      return { status: 200, body: { url: page } };
    return { status: 404, body: { error: "not_found" } };
  }
  if (url.pathname.startsWith("/v1/")) {
    const reviewer = headers["x-recipe-preview"] === env.apiV1;
    if (url.pathname === "/v1/form-definitions") {
      const data = reviewer
        ? [
            { formId: "open-form", visibility: "public" },
            // Skipped: Journey 3 flips it to public mid-run.
            { formId: "e2e-maintenance-check", visibility: "preview" },
            { formId: "hidden-form", visibility: "preview" },
          ]
        : [{ formId: "open-form" }];
      return { status: 200, body: { status: "success", data } };
    }
    if (
      url.pathname === "/v1/form-definitions/hidden-form" &&
      (reviewer || env.leaks === "api v1")
    )
      return { status: 200, body: { status: "success" } };
    return { status: 404, body: { message: "Not found" } };
  }
  // Landing.
  const preview = url.searchParams.get("preview");
  if (preview !== null) {
    if (env.dropsGrant) return { status: 0 };
    return {
      status: 307,
      location: url.pathname,
      cookie:
        preview === env.landing
          ? "preview=preview; Path=/; HttpOnly; Secure; SameSite=Lax"
          : undefined,
    };
  }
  if (url.pathname === "/site/a")
    return { status: 200, source: env.landingSource };
  if (url.pathname === "/site/b")
    return { status: 200, source: env.secondSource ?? env.landingSource };
  if (url.pathname === "/site/p") {
    // A reviewer's read goes to api_v2 with landing's own value.
    const reviewer =
      headers.cookie === "preview=preview" && env.landing === env.apiV2;
    if (reviewer || env.leaks === "landing")
      return { status: 200, source: env.reviewerSource ?? "api_v2" };
  }
  return { status: 404 };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const headers = req.headers as Record<string, string | undefined>;
    const out = handle(url, headers) as {
      status: number;
      body?: unknown;
      source?: string;
      location?: string;
      cookie?: string;
    };
    if (out.status === 0) return void req.socket.destroy();
    if (out.source) res.setHeader("x-content-source", out.source);
    if (out.location) res.setHeader("location", out.location);
    if (out.cookie) res.setHeader("set-cookie", out.cookie);
    res.statusCode = out.status;
    res.end(out.body === undefined ? "" : JSON.stringify(out.body));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  targets = {
    apiV1: `${base}/v1`,
    apiV2: `${base}/v2`,
    landing: `${base}/site`,
  };
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  env = { apiV1: TOKEN, apiV2: TOKEN, landing: TOKEN, landingSource: "api_v2" };
});

async function run() {
  const report = await checkPreviewToken(targets, TOKEN, fetch, 0);
  expect(JSON.stringify(report)).not.toContain(TOKEN);
  return report;
}

describe("checkPreviewToken", () => {
  it("passes when all three systems accept the token", async () => {
    const report = await run();
    expect(report.failures).toEqual([]);
    expect(report.notes).toEqual([
      "api_v2 accepts the preview token (/p)",
      "api v1 accepts the preview token (hidden-form)",
      "landing accepts the preview token (/p)",
    ]);
  });

  it("names api_v2 when it refuses the token", async () => {
    env.apiV2 = OTHER;
    env.landing = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^api_v2 refused the preview token \(401/),
    ]);
    expect(report.notes).toContain(
      "landing skipped: it needs api_v2's catalog to find a page",
    );
  });

  it("names api v1 when it refuses the token", async () => {
    env.apiV1 = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(
        /^api v1 refused the preview token \(\/form-definitions gave the public list\)/,
      ),
    ]);
  });

  it("names landing when it refuses the token", async () => {
    env.landing = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^landing refused the preview token/),
    ]);
  });

  it("fails when landing's reviewer read does not come from api_v2", async () => {
    env.reviewerSource = "static-fallback";
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(
        /^landing accepted the preview token but did not serve \/p from api_v2 \(HTTP 200, x-content-source: static-fallback\)/,
      ),
    ]);
  });

  it("skips landing while it serves static content", async () => {
    env.landingSource = "static";
    env.landing = OTHER;
    const report = await run();
    expect(report.failures).toEqual([]);
    expect(report.notes).toContain(
      "landing skipped: it serves static content (x-content-source: static), not api_v2 yet",
    );
  });

  it("checks landing when a public page is a static fallback", async () => {
    env.landingSource = "static-fallback";
    env.landing = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^landing refused the preview token/),
    ]);
  });

  it("checks landing when only some public pages are static", async () => {
    env.landingSource = "static";
    env.secondSource = "api_v2";
    env.landing = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^landing refused the preview token/),
    ]);
  });

  it("fails when no public page tells landing's content source", async () => {
    env.landingSource = undefined;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^landing: none of 5 public pages sent/),
    ]);
  });

  it.each([
    ["api_v2", "api_v2 serves preview page /p without the token"],
    ["api v1", "api v1 serves non-public form hidden-form without the token"],
    ["landing", "landing serves preview page /p without the token"],
  ] as const)(
    "fails when %s serves its preview item without the token",
    async (system, message) => {
      env.leaks = system;
      const report = await run();
      expect(report.failures).toEqual([`${message} (HTTP 200, not 404)`]);
    },
  );

  it("reports a failed request with the token in its URL without the token", async () => {
    env.dropsGrant = true;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^landing: request failed \(/),
    ]);
  });
});

describe("the script", () => {
  function script(extraEnv: Record<string, string>) {
    return new Promise<{ code: number; output: string }>((resolve) => {
      execFile(
        join(__dirname, "../node_modules/.bin/tsx"),
        ["check-preview-token.ts"],
        {
          cwd: __dirname,
          env: {
            ...process.env,
            API_V1_URL: targets.apiV1,
            API_V2_URL: targets.apiV2,
            LANDING_URL: targets.landing,
            ...extraEnv,
          },
        },
        (error, stdout, stderr) =>
          resolve({
            code: error ? Number(error.code) : 0,
            output: stdout + stderr,
          }),
      );
    });
  }

  it("exits 1 naming the system, and never prints the token", async () => {
    env.landing = OTHER;
    const { code, output } = await script({ PREVIEW_TOKEN: TOKEN });
    expect(code).toBe(1);
    expect(output).toContain(
      "::error title=Preview token mismatch::landing refused the preview token",
    );
    expect(output).not.toContain(TOKEN);
  }, 30_000);

  it("fails closed when the secret is not set", async () => {
    const { code, output } = await script({ PREVIEW_TOKEN: "" });
    expect(code).toBe(1);
    expect(output).toContain("PREVIEW_TOKEN is empty");
  }, 30_000);
});
