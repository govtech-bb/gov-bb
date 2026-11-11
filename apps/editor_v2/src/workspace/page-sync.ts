import type { Category } from "../api/categories";
import { markdownToPageSaveInput } from "../api/page-markdown";
import type { Outcome } from "../api/write-attempt";
import type { PageSaveRequest, ServerPageBaseline } from "../api/writes";

function withoutVisibility(markdown: string) {
  return markdown
    .trimEnd()
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, (frontmatter) =>
      frontmatter.replace(/^visibility:.*(?:\r?\n|$)/m, ""),
    );
}

/** Validate and convert the displayed page before starting a write attempt. */
export function preparePageSave(
  base: ServerPageBaseline,
  markdown: string,
  categories: readonly Category[],
):
  | { ok: true; request: PageSaveRequest }
  | { ok: false; outcome: Extract<Outcome<never>, { kind: "invalid" }> } {
  const fields = markdownToPageSaveInput(markdown, base.page, categories);

  if (!fields.ok) return { ok: false, outcome: { kind: "invalid", errors: fields.errors } };
  const hiding = base.page.visibility === "public" && fields.value.visibility !== "public";

  if (hiding && withoutVisibility(markdown) !== withoutVisibility(base.markdown))
    return {
      ok: false,
      outcome: {
        kind: "invalid",
        errors: [
          {
            field: "visibility",
            message: "Save your other changes before you change who can see the page",
          },
        ],
      },
    };

  return {
    ok: true,
    request: { base, markdown, categories, fields: fields.value, hiding },
  };
}
