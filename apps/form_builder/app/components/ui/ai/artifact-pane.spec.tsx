// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArtifactPane } from "./artifact-pane";
import { ReviewCard, type PreparedChange } from "./review";
import { AppliedCard } from "./applied-card";

const change = {
  before: { title: "Old" },
  after: { title: "New" },
  warnings: [],
};

it("renders the changes empty state without a preview surface", () => {
  render(<ArtifactPane validating={false} />);
  expect(screen.getByRole("complementary", { name: "Changes" })).toBeVisible();
  expect(screen.getByText("No proposed changes")).toBeVisible();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(document.querySelector("iframe")).toBeNull();
});

it("shows validation before displaying the proposed diff", async () => {
  const view = render(<ArtifactPane validating />);
  expect(
    screen.getByText("Changes will appear here after the draft check."),
  ).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  view.rerender(<ArtifactPane validating={false} change={change} />);
  expect(screen.getByText(/1 section changes: title/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "title" }));
  expect(await screen.findByText("Old")).toBeVisible();
  expect(screen.getByText("New")).toBeVisible();
});

it("closes the changes pane without affecting the proposal", () => {
  const onClose = vi.fn();
  render(<ArtifactPane validating={false} change={change} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Close changes" }));
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
