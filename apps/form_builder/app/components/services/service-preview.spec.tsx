// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { serviceSnapshotSchema } from "@govtech-bb/form-types";
import { ServicePreviewBody } from "./service-preview";

vi.mock("../../server/registry", () => ({
  previewRecipe: vi.fn(() => new Promise(() => {})),
}));

const pageId = "11111111-1111-4111-8111-111111111111";
const snapshot = serviceSnapshotSchema.parse({
  manifest: {
    schemaVersion: 1,
    serviceId: "housing",
    title: "Housing",
    formId: "housing",
    entryPoint: pageId,
    pages: [
      {
        id: pageId,
        kind: "main",
        title: "Apply for housing",
        path: "apps/landing/src/content/housing/index.md",
        publicPath: "/housing",
      },
    ],
  },
  pages: [
    {
      id: pageId,
      path: "apps/landing/src/content/housing/index.md",
      body: "Apply for housing.",
      frontmatter: { title: "Apply for housing" },
      baseSha: null,
    },
  ],
  recipe: { formId: "housing", title: "Housing", steps: [] },
  pendingConfig: { mdaContactId: null, processors: null },
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function unavailable(initialPageId: string, savedFormId?: string | null) {
  render(
    <ServicePreviewBody
      snapshot={snapshot}
      initialPageId={initialPageId}
      savedFormId={savedFormId}
    />,
  );
  act(() => vi.advanceTimersByTime(7000));
  expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
}

it("offers the saved form in a new tab when the form preview is unavailable", () => {
  unavailable("form", "housing");
  const link = screen.getByRole("link", { name: /Preview saved form/ });
  expect(link).toHaveAttribute(
    "href",
    "https://forms.example.test/forms/housing?draft=stub-token",
  );
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

it("does not offer the saved form before the form has been saved", () => {
  unavailable("form", null);
  expect(
    screen.queryByRole("link", { name: /Preview saved form/ }),
  ).not.toBeInTheDocument();
});

it("does not offer the saved form for a content page", () => {
  unavailable(pageId, "housing");
  expect(
    screen.queryByRole("link", { name: /Preview saved form/ }),
  ).not.toBeInTheDocument();
});
