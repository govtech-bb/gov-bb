import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { checkPreviewToken, type Targets } from "./check-preview-token";

const TOKEN = "ci-token-0123456789abcdef";
const OTHER = "other-token-fedcba9876543210";

/** What each stub system holds and how it behaves. */
interface Env {
  apiV1Secret: string;
  apiV2Secret: string;
  landingSecret: string;
  landingSource: "api_v2" | "static";
  /** api_v2 serves the preview page to everyone. */
  apiV2PageLeaks?: boolean;
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
  const v2Token = headers["x-preview-token"];
  if (url.pathname.startsWith("/v2/")) {
    if (v2Token !== undefined && v2Token !== env.apiV2Secret)
      return { status: 401, body: { error: "invalid_preview_token" } };
    const reviewer = v2Token !== undefined;
    if (url.pathname === "/v2/catalog") {
      const pages = [{ url: "/a", visibility: "public" }];
      if (reviewer) pages.push({ url: "/p", visibility: "preview" });
      return { status: 200, body: { pages } };
    }
    const page = url.searchParams.get("url");
    if (page === "/a" || (page === "/p" && (reviewer || env.apiV2PageLeaks)))
      return { status: 200, body: { url: page } };
    return { status: 404, body: { error: "not_found" } };
  }
  if (url.pathname.startsWith("/v1/")) {
    const reviewer = headers["x-recipe-preview"] === env.apiV1Secret;
    if (url.pathname === "/v1/form-definitions") {
      const data = reviewer
        ? [
            { formId: "open-form", visibility: "public" },
            { formId: "hidden-form", visibility: "preview" },
          ]
        : [{ formId: "open-form" }];
      return { status: 200, body: { status: "success", data } };
    }
    if (url.pathname === "/v1/form-definitions/hidden-form" && reviewer)
      return { status: 200, body: { status: "success" } };
    return { status: 404, body: { message: "Not found" } };
  }
  // Landing.
  if (url.pathname === "/site/a")
    return { status: 200, source: env.landingSource };
  if (url.pathname === "/site/p") {
    const preview = url.searchParams.get("preview");
    if (preview !== null)
      return {
        status: 307,
        location: "/site/p",
        cookie:
          preview === env.landingSecret
            ? "preview=preview; Path=/; HttpOnly; Secure; SameSite=Lax"
            : undefined,
      };
    // A reviewer's read goes to api_v2 with landing's own secret.
    if (
      env.landingSource === "api_v2" &&
      headers.cookie === "preview=preview" &&
      env.landingSecret === env.apiV2Secret
    )
      return { status: 200, source: "api_v2" };
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
  env = {
    apiV1Secret: TOKEN,
    apiV2Secret: TOKEN,
    landingSecret: TOKEN,
    landingSource: "api_v2",
  };
});

async function run() {
  const report = await checkPreviewToken(targets, TOKEN);
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
    env.apiV2Secret = OTHER;
    env.landingSecret = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^api_v2 refused the preview token \(401/),
    ]);
    expect(report.notes).toContain(
      "landing skipped: it needs api_v2's catalog to find a page",
    );
  });

  it("names api v1 when it refuses the token", async () => {
    env.apiV1Secret = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(
        /^api v1 refused the preview token \(\/form-definitions gave the public list\)/,
      ),
    ]);
  });

  it("names landing when it refuses the token", async () => {
    env.landingSecret = OTHER;
    const report = await run();
    expect(report.failures).toEqual([
      expect.stringMatching(/^landing refused the preview token/),
    ]);
  });

  it("skips landing while it serves static content", async () => {
    env.landingSource = "static";
    env.landingSecret = OTHER;
    const report = await run();
    expect(report.failures).toEqual([]);
    expect(report.notes).toContain(
      "landing skipped: it serves static content (x-content-source: static), not api_v2 yet",
    );
  });

  it("fails a preview page served without the token", async () => {
    env.apiV2PageLeaks = true;
    const report = await run();
    expect(report.failures).toContain(
      "api_v2 serves preview page /p without the token (HTTP 200, not 404)",
    );
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
    env.landingSecret = OTHER;
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
