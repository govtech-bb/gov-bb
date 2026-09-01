/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PublishModal } from "./-publish-modal";
import type { RecipeDraft } from "@govtech-bb/form-builder";

const draft = {
  formId: "passport",
  title: "Passport Application",
  description: "",
  steps: [],
};

function renderModal(
  props: Partial<React.ComponentProps<typeof PublishModal>> = {},
) {
  return render(
    <PublishModal
      draft={draft}
      baseBranch="dev"
      isPublishing={false}
      publishSuccess={null}
      publishError={null}
      onPublish={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("PublishModal base branch", () => {
  it("shows the configured base branch in the pre-publish copy", () => {
    renderModal({ baseBranch: "sandbox" });
    // The branch renders as a <code> element inside the "against …" sentence.
    expect(screen.getByText("sandbox").tagName).toBe("CODE");
  });

  it("shows the configured base branch in the success copy", () => {
    renderModal({
      baseBranch: "sandbox",
      publishSuccess: {
        prUrl: "https://example.test/pr/7",
        prNumber: 7,
        updatedExistingPR: false,
      },
    });
    expect(screen.getByText("sandbox").tagName).toBe("CODE");
  });

  it("uses the dev branch when that is what is configured", () => {
    renderModal({ baseBranch: "dev" });
    expect(screen.getByText("dev").tagName).toBe("CODE");
  });
});

describe("PublishModal deploy button", () => {
  it("enables Deploy when not publishing or read-only (#1196: no version gate)", () => {
    renderModal({ isPublishing: false });
    expect(screen.getByRole("button", { name: "Deploy" })).toBeEnabled();
  });

  it("disables Deploy while publishing", () => {
    renderModal({ isPublishing: true });
    expect(
      screen.getByRole("button", { name: /Opening PR…|Deploy/ }),
    ).toBeDisabled();
  });
});

// #2390: Deploy either opens a fresh PR or pushes onto one already open for
// this form (to avoid a duplicate PR colliding on the same recipe file) — the
// success copy must say which happened.
describe("PublishModal success copy (#2390)", () => {
  it("says a PR was opened when updatedExistingPR is false", () => {
    const { container } = renderModal({
      baseBranch: "dev",
      publishSuccess: {
        prUrl: "https://example.test/pr/7",
        prNumber: 7,
        updatedExistingPR: false,
      },
    });
    // The wording spans a <strong>#7</strong> and a <code>dev</code>, so
    // match against the rendered text as a whole rather than a single node.
    expect(container.textContent).toMatch(/PR #7 opened on dev/);
    expect(container.textContent).not.toMatch(/already-open PR/);
  });

  it("says the recipe was pushed onto the already-open PR when updatedExistingPR is true, and does not claim a new PR was opened", () => {
    const { container } = renderModal({
      baseBranch: "dev",
      publishSuccess: {
        prUrl: "https://example.test/pr/7",
        prNumber: 7,
        updatedExistingPR: true,
      },
    });
    expect(container.textContent).toMatch(
      /Pushed to the already-open PR #7 for this form.*no duplicate PR was created/,
    );
    expect(container.textContent).not.toMatch(/PR #7 opened on/);
  });

  it("renders the PR link and reviewer note for the new-PR case", () => {
    renderModal({
      publishSuccess: {
        prUrl: "https://example.test/pr/7",
        prNumber: 7,
        updatedExistingPR: false,
      },
    });
    expect(
      screen.getByRole("link", { name: "https://example.test/pr/7" }),
    ).toHaveAttribute("href", "https://example.test/pr/7");
    expect(
      screen.getByText(/A reviewer must approve and merge it/),
    ).toBeInTheDocument();
  });

  it("renders the PR link and reviewer note for the reuse case", () => {
    renderModal({
      publishSuccess: {
        prUrl: "https://example.test/pr/7",
        prNumber: 7,
        updatedExistingPR: true,
      },
    });
    expect(
      screen.getByRole("link", { name: "https://example.test/pr/7" }),
    ).toHaveAttribute("href", "https://example.test/pr/7");
    expect(
      screen.getByText(/A reviewer must approve and merge it/),
    ).toBeInTheDocument();
  });
});
