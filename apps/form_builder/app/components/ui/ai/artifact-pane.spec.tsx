// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { serviceSnapshotSchema } from "@govtech-bb/form-types";
import { ArtifactPane } from "./artifact-pane";
import { ReviewCard, type PreparedChange } from "./review";
import { AppliedCard } from "./applied-card";
import { ServicePreviewBody } from "../../services/service-preview";

vi.mock("../../../server/registry", () => ({ previewRecipe: vi.fn() }));

const snapshot = serviceSnapshotSchema.parse({
  manifest: {
    schemaVersion: 1,
    serviceId: "housing",
    title: "Housing",
    formId: null,
    entryPoint: "11111111-1111-4111-8111-111111111111",
    pages: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "main",
        title: "Apply for housing",
        path: "apps/landing/src/content/housing/index.md",
        publicPath: "/housing",
      },
    ],
  },
  pages: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      path: "apps/landing/src/content/housing/index.md",
      body: "Apply for housing.",
      frontmatter: { title: "Apply for housing" },
      baseSha: null,
    },
  ],
  recipe: null,
  pendingConfig: { mdaContactId: null, processors: null },
});
const change = {
  before: { title: "Old" },
  after: { title: "New" },
  warnings: [],
};

it("renders preview and changes empty states when opened", () => {
  render(<ArtifactPane validating={false} revision="1" />);
  expect(
    screen.getByRole("complementary", { name: "Preview and changes" }),
  ).toBeVisible();
  expect(screen.getByText("No preview available")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
  expect(screen.getByText("No proposed changes")).toBeVisible();
});

it("opens changes for each proposal while preserving a manual choice through validation", async () => {
  const props = { artifact: { snapshot }, revision: "1", proposalId: "one" };
  const view = render(<ArtifactPane {...props} validating />);
  expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.getByText("Changes will appear here after the draft check."),
  ).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
  expect(screen.getByTitle("Service journey preview")).toBeVisible();
  view.rerender(<ArtifactPane {...props} validating={false} change={change} />);
  expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  view.rerender(
    <ArtifactPane
      {...props}
      proposalId="two"
      validating={false}
      change={change}
    />,
  );
  expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText(/1 section changes: title/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "title" }));
  expect(await screen.findByText("Old")).toBeVisible();
  expect(screen.getByText("New")).toBeVisible();
});

it("renders an embedded journey and captures its snapshot until the revision changes", () => {
  const view = render(<ServicePreviewBody snapshot={snapshot} compact />);
  const frame = screen.getByTitle(
    "Service journey preview",
  ) as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  view.rerender(
    <ServicePreviewBody
      snapshot={{
        ...snapshot,
        pages: [{ ...snapshot.pages[0], body: "Updated draft." }],
      }}
      compact
    />,
  );
  fireEvent.load(frame);
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      source: "gov-bb-start-page-editor",
      body: "Apply for housing.",
    }),
    "http://localhost:4000",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  const pane = render(
    <ArtifactPane artifact={{ snapshot }} validating={false} revision="1" />,
  );
  const originalFrame = screen.getByTitle("Service journey preview");
  pane.rerender(
    <ArtifactPane artifact={{ snapshot }} validating={false} revision="2" />,
  );
  expect(screen.getByTitle("Service journey preview")).not.toBe(originalFrame);
});

it("handles explicit tab requests, preserves subsequent manual choices, and closes", () => {
  const onClose = vi.fn();
  const props = {
    artifact: { snapshot },
    revision: "1",
    proposalId: "one",
    change,
    validating: false,
    onClose,
  };
  const view = render(<ArtifactPane {...props} />);
  expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const requestedTab = { id: 1, value: "preview" as const };
  view.rerender(<ArtifactPane {...props} requestedTab={requestedTab} />);
  expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
  view.rerender(
    <ArtifactPane {...props} requestedTab={requestedTab} validating />,
  );
  expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  view.rerender(
    <ArtifactPane {...props} requestedTab={{ id: 2, value: "preview" }} />,
  );
  expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  view.rerender(
    <ArtifactPane
      {...props}
      proposalId="two"
      requestedTab={{ id: 2, value: "preview" }}
    />,
  );
  expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Close preview and changes" }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it("keeps review warnings visible while showing the diff in only its selected location", async () => {
  const prepared: PreparedChange = {
    ...change,
    warnings: ["Repair the form link before saving."],
    apply: vi.fn(),
  };
  const onViewChanges = vi.fn();
  const onApprove = vi.fn();
  const props = {
    proposal: { summary: "Clarify the title." },
    stale: false,
    disabled: false,
    prepare: vi.fn().mockResolvedValue(prepared),
    onApprove,
    onReject: vi.fn(),
  };
  const view = render(<ReviewCard {...props} onViewChanges={onViewChanges} />);
  expect(await screen.findByText(prepared.warnings[0])).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "View changes · 1 section" }),
  );
  expect(onViewChanges).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole("button", { name: "title" }),
  ).not.toBeInTheDocument();
  view.rerender(<ReviewCard {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: "View changes · 1 section" }),
  );
  expect(await screen.findByRole("button", { name: "title" })).toBeVisible();
  expect(screen.getAllByText(prepared.warnings[0])).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Apply with warnings" }));
  expect(onApprove).toHaveBeenCalledWith(prepared);
});

it("shows one validation failure and retries before approval becomes available", async () => {
  const prepared: PreparedChange = { ...change, apply: vi.fn() };
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error("The draft could not be checked."))
    .mockResolvedValue(prepared);
  render(
    <ReviewCard
      proposal={{ summary: "Clarify the title." }}
      stale={false}
      disabled={false}
      prepare={prepare}
      onApprove={vi.fn()}
      onReject={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The draft could not be checked.",
  );
  expect(screen.getAllByText("The draft could not be checked.")).toHaveLength(
    1,
  );
  expect(screen.getByRole("button", { name: "Apply to draft" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry validation" }));
  expect(
    await screen.findByRole("button", { name: "View changes · 1 section" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Apply to draft" })).toBeEnabled();
  expect(prepare).toHaveBeenCalledTimes(2);
});

it("keeps failed outcomes visible while completed diff details can open the pane", async () => {
  const onViewChanges = vi.fn();
  const view = render(
    <AppliedCard
      summary="Clarify the title."
      state="failed"
      message="Could not save the draft."
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not save the draft.",
  );
  expect(screen.getByRole("button", { name: "Not applied" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  view.rerender(
    <AppliedCard
      summary="Clarify the title."
      state="applied"
      change={change}
      onViewChanges={onViewChanges}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Applied to draft/ }));
  fireEvent.click(await screen.findByRole("button", { name: "View changes" }));
  expect(onViewChanges).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole("button", { name: "title" }),
  ).not.toBeInTheDocument();
});
