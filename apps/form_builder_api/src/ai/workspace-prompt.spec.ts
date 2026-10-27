import { workspacePrompt } from "./workspace-prompt.js";
import {
  askQuestionsTool,
  proposeContentTool,
  proposeFormTool,
  readFormTool,
  readPageTool,
  readServiceTool,
  updateServiceDetailsTool,
} from "@govtech-bb/form-builder";

// Guards the workspace-assistant prompt the way system-prompt.spec.ts guards
// the form prompt (ADR 0020): every tool name and input key the prompt steers
// the model at must be one the tools in @govtech-bb/form-builder expose, or
// the model is pointed at a call that cannot succeed. Pins the load-bearing
// vocabulary, not the wording (#2900).

const TOOLS = [
  askQuestionsTool,
  proposeContentTool,
  proposeFormTool,
  readFormTool,
  readPageTool,
  readServiceTool,
  updateServiceDetailsTool,
];
const TOOL_NAMES = new Set<string>(TOOLS.map((tool) => tool.name));

// Every snake_case token in the prompt — the shape every tool name takes.
const namedTools = [
  ...new Set(workspacePrompt.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []),
];

describe("AI workspace prompt", () => {
  it("only names tools that exist", () => {
    expect(namedTools).not.toEqual([]);
    const unknown = namedTools.filter((name) => !TOOL_NAMES.has(name));
    expect(unknown).toEqual([]);
  });

  it("routes each kind of edit to its tool", () => {
    expect(workspacePrompt).toContain(`${proposeContentTool.name} for pages`);
    expect(workspacePrompt).toContain(
      `${proposeFormTool.name} for an existing form`,
    );
    expect(workspacePrompt).toContain(
      `${updateServiceDetailsTool.name} for service details`,
    );
  });

  it("requires a target using the tools' own target keys", () => {
    expect(workspacePrompt).toContain("needs a target");
    // The proposal tools take `target: { serviceId, pagePath? }`.
    const target = proposeContentTool.inputSchema.shape.target.unwrap();
    for (const key of Object.keys(target.shape)) {
      expect(workspacePrompt).toContain(key);
    }
    expect(workspacePrompt).toContain("Never invent a serviceId or pagePath");
  });

  it("describes page creation with a value the content tool accepts", () => {
    expect(workspacePrompt).toContain("operation=create");
    expect(proposeContentTool.inputSchema.shape.operation.parse("create")).toBe(
      "create",
    );
  });

  it("pins the After submission pair that update_service_details enforces (#2891)", () => {
    expect(workspacePrompt).toContain("setup.delivery");
    expect(workspacePrompt).toContain("setup.applicantEmail");
    expect(workspacePrompt).toContain("set both or neither");
    // The sentence is load-bearing: the tool rejects one without the other.
    const call = (setup: Record<string, string>) =>
      updateServiceDetailsTool.inputSchema.safeParse({
        summary: "Decide delivery",
        target: { serviceId: "housing" },
        patch: { setup },
      }).success;
    expect(call({ delivery: "configured" })).toBe(false);
    expect(call({ delivery: "configured", applicantEmail: "none" })).toBe(true);
  });

  it("reads the applied outcome the proposal tools report", () => {
    expect(workspacePrompt).toContain("applied:false");
    expect(workspacePrompt).toContain("applied:true");
    for (const tool of [
      proposeContentTool,
      proposeFormTool,
      updateServiceDetailsTool,
    ]) {
      expect(Object.keys(tool.outputSchema.shape)).toContain("applied");
    }
  });

  it("tells the model it edits drafts and never publishes", () => {
    expect(workspacePrompt).toContain("never publish");
  });
});
