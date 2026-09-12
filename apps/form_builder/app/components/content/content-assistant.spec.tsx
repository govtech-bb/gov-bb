/** @vitest-environment jsdom */
import { render } from "../../test/ui";
import { proposeContentTool } from "@govtech-bb/form-builder";
import { ContentAssistant } from "./content-assistant";
import { buildServiceRows } from "../services/service-model";
import { EMPTY_PAGE } from "../../lib/content";
import type { PreparedChange, Proposal } from "../ui/ai/review";

let prepare: (proposal: Proposal) => Promise<PreparedChange>;
vi.mock("../ui/ai/assistant", () => ({
  Assistant: (props: { prepare: typeof prepare }) => {
    prepare = props.prepare;
    return null;
  },
}));

it("creates a help-page proposal without patching the open start page, and rejects reused URLs", async () => {
  const page = {
    path: "apps/landing/src/content/get-birth-certificate/start.md",
    title: "Get a birth certificate",
    category: "family-birth-relationships",
    formId: "get-birth-certificate",
    visibility: "public",
    hasFormButton: true,
  };
  const [service] = buildServiceRows([], [page]);
  const state = {
    ...EMPTY_PAGE,
    title: page.title,
    formId: page.formId,
    slug: "get-birth-certificate/start",
    body: "Current start page content",
  };
  const onApply = vi.fn();
  const onCreatePage = vi.fn();
  render(
    <ContentAssistant
      user="editor"
      documentId={page.path}
      state={state}
      fixedPath
      service={service}
      pages={[page]}
      readOnly={false}
      open
      onOpenChange={() => {}}
      onApply={onApply}
      onCreatePage={onCreatePage}
    />,
  );
  const proposal = proposeContentTool.inputSchema.parse({
    operation: "create",
    summary: "Add a separate help page",
    patch: {
      slug: "help",
      title: "Help getting a birth certificate",
      body: "Special-case guidance",
    },
  });
  const change = await prepare(proposal);
  expect(change.createPage).toBe(true);
  expect(change.before).toEqual({});
  expect(change.after).toMatchObject({
    path: "apps/landing/src/content/get-birth-certificate/help.md",
    formId: page.formId,
    linkType: "none",
    visibility: "draft",
  });
  change.apply();
  expect(onCreatePage).toHaveBeenCalledWith(
    "apps/landing/src/content/get-birth-certificate/help.md",
    expect.objectContaining({ body: "Special-case guidance" }),
  );
  expect(onApply).not.toHaveBeenCalled();
  expect(state.body).toBe("Current start page content");
  await expect(
    prepare({ ...proposal, patch: { ...proposal.patch, slug: "start" } }),
  ).rejects.toThrow(/already uses/);
  await expect(
    prepare({ ...proposal, patch: { ...proposal.patch, slug: "../help" } }),
  ).rejects.toThrow(/invalid/);
  await expect(prepare({ ...proposal, operation: "update" })).rejects.toThrow(
    /current page URL/,
  );
  const update = await prepare({
    summary: "Improve wording",
    patch: { body: "Edited current page" },
  });
  update.apply();
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ slug: state.slug, body: "Edited current page" }),
  );
});
