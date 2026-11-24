import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESTATE } from "../src/seed-data";
import {
  AUTH_ENV,
  HAS_DATABASE,
  createEmployeeSession,
  databaseQuery,
  runScript,
  startCheckImportEnv,
  type EmployeeSession,
} from "./support";

const SECRET = "e2e-preview-secret";

/** Childless root pages of one visibility, so changing one moves nothing else. */
const leaves = (visibility: "public" | "preview") =>
  ESTATE.pages
    .filter(
      (page) =>
        page.visibility === visibility &&
        !page.parent &&
        !ESTATE.pages.some((child) => child.parent === page.url),
    )
    .map((page) => page.url);

// Its own file, so its server has its own 1,000-reads-a-minute budget for
// the two check-import runs (~257 reads each).
describe.skipIf(!HAS_DATABASE)("sync-estate", () => {
  let env: Awaited<ReturnType<typeof startCheckImportEnv>>;
  let operator: EmployeeSession;
  let editor: EmployeeSession;
  let approver: EmployeeSession;
  let differences: string;

  const [publicUpdate, pendingRevision, newPublic] = leaves("public");
  const [previewUpdate, editedByEditor, newPreview] = leaves("preview");
  const extra = "/sync-estate-extra";

  const sync = (file: string, extra: string[] = []) =>
    runScript(
      "scripts/sync-estate.ts",
      [
        "--base-url",
        env.server.url,
        "--editor-origin",
        AUTH_ENV.EDITOR_ORIGIN,
        "--forms-api",
        env.formsApi,
        "--differences",
        file,
        ...extra,
      ],
      { EDITOR_SESSION: operator.cookie },
    );

  /** One editor API call as `who`, with the editor's Origin. */
  const call = async (
    who: EmployeeSession,
    method: string,
    path: string,
    body?: unknown,
  ) => {
    const response = await fetch(`${env.server.url}${path}`, {
      method,
      headers: {
        cookie: who.cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    expect(response.status, JSON.stringify(json)).toBeLessThan(300);
    return json;
  };

  const idOf = async (url: string) =>
    (
      (await databaseQuery(
        env.database,
        "select id from content_pages where url = $1",
        [url],
      )) as { id: string }[]
    )[0]?.id;

  /** The editor saves a page's fields with `over` laid on top. */
  const save = async (
    who: EmployeeSession,
    url: string,
    over: Record<string, unknown>,
  ) => {
    const id = await idOf(url);
    const page = await call(who, "GET", `/pages/${id}`);
    const fields = [
      "url",
      "category_id",
      "parent_id",
      "title",
      "description",
      "visibility",
      "form_id",
      "body_markdown",
      "frontmatter",
    ];
    await call(who, "PUT", `/pages/${id}`, {
      ...Object.fromEntries(fields.map((field) => [field, page[field]])),
      ...over,
      expected_version: page.version,
    });
  };

  /** Everything a write would move: history, revisions and page content. */
  const state = () =>
    databaseQuery(
      env.database,
      `select
         (select count(*) from change_events) as events,
         (select count(*) from page_revisions) as revisions,
         (select md5(string_agg(id || url || title || body_markdown || visibility::text, ',' order by url))
            from content_pages) as pages`,
    );

  const title = async (url: string) =>
    (
      (await databaseQuery(
        env.database,
        "select title from content_pages where url = $1",
        [url],
      )) as { title: string }[]
    )[0]?.title;

  beforeAll(async () => {
    env = await startCheckImportEnv(SECRET);
    const session = (roles: string[]) =>
      createEmployeeSession(env.database, env.server.url, { roles });
    operator = await session(["editor"]);
    editor = await session(["editor"]);
    approver = await session(["approver"]);

    // The database as an older snapshot left it: changes by `system`.
    await databaseQuery(
      env.database,
      "update content_pages set title = 'Old title' where url = $1 or url = $2",
      [publicUpdate, pendingRevision],
    );
    await databaseQuery(
      env.database,
      "update content_pages set body_markdown = 'Old body' where url = $1",
      [previewUpdate],
    );
    await databaseQuery(
      env.database,
      "delete from content_pages where url = $1 or url = $2",
      [newPublic, newPreview],
    );
    // Editors' work since the import.
    await save(editor, editedByEditor, { title: "An editor's title" });
    await save(editor, pendingRevision, { title: "A pending title" });
    await call(editor, "POST", "/pages", {
      url: extra,
      title: "A page only api_v2 has",
      body_markdown: "Written in the editor.",
      visibility: "preview",
    });

    const check = await env.check(SECRET, ["--json"]);
    expect(check.code, check.output).toBe(1);
    differences = join(mkdtempSync(join(tmpdir(), "sync-estate-")), "d.json");
    writeFileSync(differences, check.stdout);
  }, 120_000);

  afterAll(async () => {
    await env?.stop();
  });

  it("refuses differences from another snapshot", async () => {
    const other = join(mkdtempSync(join(tmpdir(), "sync-estate-")), "d.json");
    writeFileSync(other, JSON.stringify({ source: "abc", differences: [] }));
    const { code, output } = await sync(other);
    expect(code, output).toBe(1);
    expect(output).toContain("--differences is from snapshot abc");
    expect(output).not.toContain(operator.token);
  }, 60_000);

  it("dry run: reports each page and writes nothing", async () => {
    const before = await state();
    const { code, output } = await sync(differences);
    expect(code, output).toBe(0);
    expect(await state()).toEqual(before);

    expect(output).toMatch(new RegExp(`^update ${publicUpdate}: title`, "m"));
    expect(output).toMatch(
      new RegExp(`^update ${previewUpdate}: body_markdown`, "m"),
    );
    expect(output).toMatch(new RegExp(`^create ${newPublic}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^create ${newPreview}\\b`, "m"));
    expect(output).toMatch(
      new RegExp(
        `^conflict ${editedByEditor}: changed by API test employee`,
        "m",
      ),
    );
    expect(output).toMatch(
      new RegExp(`^conflict ${pendingRevision}: has a draft revision`, "m"),
    );
    expect(output).toMatch(new RegExp(`^removed ${extra}\\b`, "m"));
    expect(output.match(/^unchanged /gm)).toHaveLength(ESTATE.pages.length - 6);
    expect(output).toContain("Dry run");
    expect(output).not.toContain(operator.token);
  }, 60_000);

  it("--apply: updates and creates through the editor API, and skips editors' pages", async () => {
    const { code, output } = await sync(differences, ["--apply"]);
    expect(code, output).toBe(0);
    expect(output).toMatch(new RegExp(`^updated ${publicUpdate}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^updated ${previewUpdate}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^created ${newPublic}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^created ${newPreview}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^conflict ${editedByEditor}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^conflict ${pendingRevision}\\b`, "m"));
    expect(output).toMatch(new RegExp(`^removed ${extra}\\b`, "m"));
    expect(output).toMatch(/^1 revisions waiting for approval$/m);
    expect(output).toContain(`make public: ${newPublic}`);
    expect(output).not.toContain(operator.token);

    // The public page waits for an approver; the preview one is written.
    expect(await title(publicUpdate)).toBe("Old title");
    const revisions = (await databaseQuery(
      env.database,
      `select r.status, r.fields->>'title' as title, r.submitted_by
         from page_revisions r join content_pages p on p.id = r.page_id
        where p.url = $1`,
      [publicUpdate],
    )) as { status: string; title: string; submitted_by: string }[];
    const snapshot = (url: string) =>
      ESTATE.pages.find((page) => page.url === url)!;
    expect(revisions).toEqual([
      {
        status: "submitted",
        title: snapshot(publicUpdate).title,
        submitted_by: operator.userId,
      },
    ]);
    const [preview] = (await databaseQuery(
      env.database,
      "select body_markdown from content_pages where url = $1",
      [previewUpdate],
    )) as { body_markdown: string }[];
    expect(preview!.body_markdown).toBe(snapshot(previewUpdate).body_markdown);
    // Created by the operator; nobody may create a page public they wrote.
    const created = (await databaseQuery(
      env.database,
      `select p.url, p.visibility::text, e.actor from content_pages p
         join change_events e on e.entity_id = p.id::text and e.action = 'created'
        where p.url = $1 or p.url = $2 order by p.url`,
      [newPublic, newPreview],
    )) as { url: string; visibility: string; actor: string }[];
    expect(created).toEqual(
      [newPublic, newPreview].sort().map((url) => ({
        url,
        visibility: "preview",
        actor: operator.userId,
      })),
    );
    // Editors' work and the extra page are left as they were.
    expect(await title(editedByEditor)).toBe("An editor's title");
    expect(await title(pendingRevision)).toBe("Old title");
    expect(await title(extra)).toBe("A page only api_v2 has");
  }, 60_000);

  it("after the approvals, only the editors' pages and the extra page differ", async () => {
    const id = await idOf(publicUpdate);
    const page = await call(approver, "GET", `/pages/${id}`);
    await call(approver, "POST", `/pages/${id}/revision/publish`, {
      expected_version: page.version,
    });
    await save(approver, newPublic, { visibility: "public" });

    const { code, output, stdout } = await env.check(SECRET, ["--json"]);
    expect(code, output).toBe(1);
    expect(output).toContain(`0 failing of ${ESTATE.pages.length} pages`);
    const left = (
      JSON.parse(stdout) as { differences: { url: string }[] }
    ).differences.map((difference) => difference.url);
    expect([...new Set(left)].sort()).toEqual(
      [editedByEditor, pendingRevision, extra].sort(),
    );
  }, 60_000);
});
