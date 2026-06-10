jest.mock("@govtech-bb/database", () => ({
  CustomComponent: class CustomComponent {},
}));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));
jest.mock("./client.js", () => ({ chat: jest.fn() }));
jest.mock("./recipe-extractor.js", () => ({ extractRecipe: jest.fn() }));

import { chat } from "./client.js";
import { extractRecipe } from "./recipe-extractor.js";
import { getDataSource } from "../db.js";
import { generateRecipeResponse } from "./recipe-generation";

const chatMock = chat as jest.Mock;
const extractRecipeMock = extractRecipe as jest.Mock;
const getDataSourceMock = getDataSource as jest.Mock;

// getFullCatalog reads custom components from the DB; no customs keeps the
// catalog to builtins + registry so the ref pre-check below is deterministic.
function mockNoCustoms() {
  getDataSourceMock.mockResolvedValue({
    getRepository: () => ({ find: jest.fn().mockResolvedValue([]) }),
  });
}

describe("generateRecipeResponse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatMock.mockResolvedValue("assistant reply");
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });
    mockNoCustoms();
  });

  it("returns the reply, extracted recipe and empty refs for a clean recipe", async () => {
    const result = await generateRecipeResponse("SYS", [
      { role: "user", content: "hi" },
    ]);
    expect(result).toEqual({
      recipe: { formId: "f", steps: [] },
      reply: "assistant reply",
      unresolvableRefs: [],
    });
  });

  it("forwards systemPrompt, messages and documentText to chat", async () => {
    const messages = [{ role: "user" as const, content: "convert this" }];
    await generateRecipeResponse("SYS", messages, "DOCUMENT TEXT");
    expect(chatMock).toHaveBeenCalledWith("SYS", messages, "DOCUMENT TEXT");
  });

  it("returns recipe: null with the reply when the model emits no recipe", async () => {
    extractRecipeMock.mockReturnValue(null);
    chatMock.mockResolvedValue("I can't help with that.");
    const result = await generateRecipeResponse("SYS", [
      { role: "user", content: "hi" },
    ]);
    expect(result).toEqual({
      recipe: null,
      reply: "I can't help with that.",
      unresolvableRefs: [],
    });
  });

  it("reports unresolvableRefs when the emitted recipe references an unknown ref", async () => {
    extractRecipeMock.mockReturnValue({
      formId: "f",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/generic/text" }, // pre-migration slash ref
            { ref: "components/generic-text" }, // resolves against the registry
          ],
        },
      ],
    });
    const result = await generateRecipeResponse("SYS", [
      { role: "user", content: "build a form" },
    ]);
    expect(result.unresolvableRefs).toEqual([
      { ref: "components/generic/text", path: "steps[step-1].elements[0].ref" },
    ]);
  });

  it("degrades to unresolvableRefs: [] (preserving the reply) when a step is malformed", async () => {
    extractRecipeMock.mockReturnValue({
      formId: "f",
      steps: [{ stepId: "step-1", title: "Step 1" }],
    });
    const result = await generateRecipeResponse("SYS", [
      { role: "user", content: "build a form" },
    ]);
    expect(result.reply).toBe("assistant reply");
    expect(result.unresolvableRefs).toEqual([]);
  });
});
