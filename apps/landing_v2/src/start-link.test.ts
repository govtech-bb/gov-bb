import { RenderDocument, type PageDocument } from "@govtech-bb/block-kit";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { startLinkHref } from "./start-link";

const doc = (blocks: unknown[], refs: Record<string, unknown> = {}) => ({
  version: 1,
  id: "doc-1",
  url: "/test",
  slug: "test-page",
  schema_name: "guide",
  document_type: "test",
  title: "A test page",
  description: null,
  is_draft: false,
  body: { version: 1, blocks, refs },
  updated_at: "2026-09-22T00:00:00.000Z",
});

describe("startLinkHref", () => {
  it("resolves a form start link to ${FORMS_URL}/forms/<id>", () => {
    const html = renderToStaticMarkup(
      createElement(RenderDocument, {
        doc: doc([
          {
            id: "s1",
            type: "start_link",
            label: "Start now",
            target_kind: "form",
            target: "apply-for-a-permit",
          },
        ]) as PageDocument,
        data: {},
        resolveHref: startLinkHref("https://forms.example"),
      }),
    );

    expect(html).toContain(
      'href="https://forms.example/forms/apply-for-a-permit"',
    );
  });

  it("resolves a list item form start link inside its <li>", () => {
    const html = renderToStaticMarkup(
      createElement(RenderDocument, {
        doc: doc([
          {
            id: "l1",
            type: "list",
            ordered: false,
            items: [
              {
                id: "i1",
                content: [{ text: "Apply online" }],
                start_link: {
                  label: "Start now",
                  target_kind: "form",
                  target: "apply-for-a-permit",
                },
              },
            ],
          },
        ]) as PageDocument,
        data: {},
        resolveHref: startLinkHref("https://forms.example"),
      }),
    );

    expect(html).toMatch(
      /<li[^>]*>.*<a[^>]*href="https:\/\/forms\.example\/forms\/apply-for-a-permit"[^>]*>.*<\/li>/,
    );
  });

  it("leaves page and external targets as they are", () => {
    const resolve = startLinkHref("https://forms.example");

    expect(resolve("page", "/a/page")).toBe("/a/page");
    expect(resolve("external", "https://gov.bb")).toBe("https://gov.bb");
  });
});
