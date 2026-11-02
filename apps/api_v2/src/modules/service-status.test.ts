import { describe, expect, it } from "vitest";
import type { Visibility } from "./page";
import {
  applyServiceStatuses,
  ServiceStatuses,
  type ServiceStatus,
} from "./service-status";

const page = (
  url: string,
  visibility: Visibility,
  form_id: string | null = null,
) => ({ url, form_id, content_slug: url.slice(1), visibility });

const overlay = (
  pages: ReturnType<typeof page>[],
  rows: [string, ServiceStatus][],
) => applyServiceStatuses(pages, new Map(rows));

describe("applyServiceStatuses", () => {
  it("disabled lowers a public page to preview", () => {
    const { pages, changes } = overlay(
      [page("/a", "public")],
      [["a", "disabled"]],
    );
    expect(pages[0]!.visibility).toBe("preview");
    expect(changes).toEqual([{ url: "/a", from: "public", to: "preview" }]);
  });

  it("disabled raises a draft page to preview, as landing does", () => {
    const { changes } = overlay([page("/a", "draft")], [["a", "disabled"]]);
    expect(changes).toEqual([{ url: "/a", from: "draft", to: "preview" }]);
  });

  it("enabled makes a preview page public", () => {
    const { pages } = overlay([page("/a", "preview")], [["a", "enabled"]]);
    expect(pages[0]!.visibility).toBe("public");
  });

  it("form_disabled and no row leave the level alone", () => {
    const input = [page("/a", "preview"), page("/b", "public")];
    const { pages, changes } = overlay(input, [["a", "form_disabled"]]);
    expect(pages).toEqual(input);
    expect(changes).toEqual([]);
  });

  it("keys by form_id over content_slug", () => {
    const { changes } = overlay(
      [page("/a", "public", "form-a")],
      [
        ["a", "enabled"],
        ["form-a", "disabled"],
      ],
    );
    expect(changes).toEqual([{ url: "/a", from: "public", to: "preview" }]);
  });

  it("ignores a row matching no page and does not mutate its input", () => {
    const input = [page("/a", "public")];
    const { pages } = overlay(input, [["nothing", "disabled"]]);
    expect(pages).toEqual(input);
    overlay(input, [["a", "disabled"]]);
    expect(input[0]!.visibility).toBe("public");
  });

  it("lists only actual changes, in input order", () => {
    const { changes } = overlay(
      [
        page("/c", "draft"),
        page("/a", "public"),
        page("/b", "preview"),
        page("/d", "public"),
      ],
      [
        ["a", "enabled"],
        ["b", "disabled"],
        ["c", "disabled"],
        ["d", "disabled"],
      ],
    );
    expect(changes.map((change) => change.url)).toEqual(["/c", "/d"]);
  });
});

describe("ServiceStatuses", () => {
  const envelope = (data: unknown, status = "success") => ({
    status,
    data,
    message: "ok",
    statusCode: 200,
  });

  it("parses the envelope into a key → status map", () => {
    expect(
      ServiceStatuses.parse(
        envelope([
          { slug: "a", status: "enabled" },
          { slug: "b", status: "form_disabled" },
        ]),
      ),
    ).toEqual(
      new Map([
        ["a", "enabled"],
        ["b", "form_disabled"],
      ]),
    );
  });

  it.each([
    ["an error envelope", envelope([], "error")],
    ["an unknown status", envelope([{ slug: "a", status: "paused" }])],
    ["an empty slug", envelope([{ slug: "", status: "enabled" }])],
  ])("rejects %s", (_, body) => {
    expect(ServiceStatuses.safeParse(body).success).toBe(false);
  });
});
