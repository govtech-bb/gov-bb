/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// The convert server-fn is a createServerFn (ESM + RPC at module-eval); stub it.
const convertRecipe = jest.fn();
jest.mock("../../server/ai-builder/convert", () => ({
  convertRecipe: (...args: unknown[]) => convertRecipe(...args),
  getAiStatus: jest.fn(),
}));

import { AiSidebar } from "./-ai-sidebar";

const DRAFT: RecipeDraft = {
  formId: "contact",
  title: "Contact",
  steps: [{ stepId: "step-1", title: "Step 1", fields: [], behaviours: [] }],
};

function setup(onApplyRecipe = jest.fn().mockResolvedValue({ applied: true })) {
  render(
    <AiSidebar draft={DRAFT} version="1.0.0" onApplyRecipe={onApplyRecipe} />,
  );
  return { onApplyRecipe };
}

describe("AiSidebar — Edit Form", () => {
  beforeEach(() => convertRecipe.mockReset());

  it("sends the message plus the serialized draft and applies the returned recipe", async () => {
    const recipe = { formId: "contact", steps: [] };
    convertRecipe.mockResolvedValue({ recipe, reply: "Done — email is now required." });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "make the email field required",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    await waitFor(() => expect(convertRecipe).toHaveBeenCalledTimes(1));
    const arg = convertRecipe.mock.calls[0][0];
    expect(arg.data.message).toBe("make the email field required");
    // The current draft rides along as serialized recipe JSON.
    expect(JSON.parse(arg.data.recipeJson).formId).toBe("contact");

    expect(onApplyRecipe).toHaveBeenCalledWith(recipe, []);
    // Both turns land in the transcript.
    expect(screen.getByText("make the email field required")).toBeInTheDocument();
    expect(
      await screen.findByText("Done — email is now required."),
    ).toBeInTheDocument();
  });

  it("forwards unresolvableRefs from the convert response to the apply pipeline", async () => {
    const recipe = { formId: "contact", steps: [] };
    const unresolvableRefs = [
      { ref: "components/generic/text", path: "steps[step-1].elements[0].ref" },
    ];
    convertRecipe.mockResolvedValue({
      recipe,
      reply: "Built it.",
      unresolvableRefs,
    });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "build a contact form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    await waitFor(() =>
      expect(onApplyRecipe).toHaveBeenCalledWith(recipe, unresolvableRefs),
    );
  });

  it("does not apply when the model replies conversationally (no recipe)", async () => {
    convertRecipe.mockResolvedValue({ recipe: null, reply: "I can't do that." });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "delete everything",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("I can't do that.")).toBeInTheDocument();
    expect(onApplyRecipe).not.toHaveBeenCalled();
  });

  it("surfaces a validation error returned by the apply pipeline", async () => {
    convertRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "Here you go.",
    });
    const onApplyRecipe = jest
      .fn()
      .mockResolvedValue({ applied: false, error: "Duplicate field id: email." });
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add another email",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(
      await screen.findByText("Duplicate field id: email."),
    ).toBeInTheDocument();
  });
});

describe("AiSidebar — outcome feedback", () => {
  beforeEach(() => convertRecipe.mockReset());

  it("shows an 'applied' status when the recipe is applied", async () => {
    convertRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "Done.",
    });
    setup(); // default onApplyRecipe resolves { applied: true }

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add a step",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    // The status must make clear the change is in the editor only, not saved.
    const status = await screen.findByText(/applied to the editor/i);
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/not saved yet/i);
  });

  it("shows an 'unchanged' status when the apply pipeline reports a no-op", async () => {
    convertRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "No change needed.",
    });
    const onApplyRecipe = jest
      .fn()
      .mockResolvedValue({ applied: false, reason: "unchanged" });
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "no-op edit",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(
      await screen.findByText(/returned the form unchanged/i),
    ).toBeInTheDocument();
  });

  it("shows no status and no error when the user cancels the apply", async () => {
    convertRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "Here you go.",
    });
    const onApplyRecipe = jest
      .fn()
      .mockResolvedValue({ applied: false, reason: "cancelled" });
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "replace the form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("Here you go.")).toBeInTheDocument();
    expect(screen.queryByText(/applied to the editor/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/returned the form unchanged/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("flags a failed extraction when the reply has a ```json block but recipe is null", async () => {
    convertRecipe.mockResolvedValue({
      recipe: null,
      reply: 'Sure:\n```json\n{ "formId": "x" }\n```',
    });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "build a form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(
      await screen.findByText(/couldn't read it automatically/i),
    ).toBeInTheDocument();
    expect(onApplyRecipe).not.toHaveBeenCalled();
  });

  it("shows no extraction-failed status for a plain conversational reply", async () => {
    convertRecipe.mockResolvedValue({ recipe: null, reply: "I can't do that." });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "delete everything",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("I can't do that.")).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't read it automatically/i),
    ).not.toBeInTheDocument();
  });

  it("strips the ```json block from the bubble when a recipe was extracted", async () => {
    convertRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply:
        'Added the step.\n```json\n{ "marker": "SHOULD_BE_STRIPPED" }\n```',
    });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add a step",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("Added the step.")).toBeInTheDocument();
    expect(screen.queryByText(/SHOULD_BE_STRIPPED/)).not.toBeInTheDocument();
  });

  it("shows a placeholder when the reply was only a ```json block", async () => {
    convertRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: '```json\n{ "marker": "SHOULD_BE_STRIPPED" }\n```',
    });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "build it",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText(/generated a form recipe/i)).toBeInTheDocument();
    expect(screen.queryByText(/SHOULD_BE_STRIPPED/)).not.toBeInTheDocument();
  });
});

describe("AiSidebar — mode-aware error messages", () => {
  beforeEach(() => convertRecipe.mockReset());

  it("shows the PDF-size hint when an upload fails with 'Invariant failed'", async () => {
    convertRecipe.mockRejectedValue(new Error("Invariant failed"));
    setup();

    const file = new File(["%PDF-1.4"], "form.pdf", { type: "application/pdf" });
    // jsdom's File doesn't implement arrayBuffer(); stub it so the upload flow
    // reaches convertRecipe (and thus the error path) instead of throwing early.
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(new ArrayBuffer(8)),
    });
    await userEvent.upload(screen.getByLabelText(/attach pdf/i), file);
    await userEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/smaller pdf/i);
  });

  it("does not mention PDFs when an edit fails with 'Invariant failed'", async () => {
    convertRecipe.mockRejectedValue(new Error("Invariant failed"));
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "make the email field required",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/pdf/i);
    expect(alert).toHaveTextContent(/edit request failed/i);
  });
});

describe("AiSidebar — collapse", () => {
  beforeEach(() => convertRecipe.mockReset());

  it("collapses and re-expands", async () => {
    setup();
    expect(screen.getByRole("button", { name: /edit form/i })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /collapse ai assistant/i }),
    );
    expect(
      screen.queryByRole("button", { name: /edit form/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /open ai assistant/i }),
    );
    expect(
      screen.getByRole("button", { name: /edit form/i }),
    ).toBeInTheDocument();
  });
});
