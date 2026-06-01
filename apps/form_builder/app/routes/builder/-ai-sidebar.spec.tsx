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

    expect(onApplyRecipe).toHaveBeenCalledWith(recipe);
    // Both turns land in the transcript.
    expect(screen.getByText("make the email field required")).toBeInTheDocument();
    expect(
      await screen.findByText("Done — email is now required."),
    ).toBeInTheDocument();
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
