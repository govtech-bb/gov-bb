/**
 * build-progress-model.spec.ts
 *
 * Unit tests for the pure step-progress-map model builder.
 *
 * Coverage:
 *  - ordering preserved
 *  - exclusions: intro, submission-confirmation produce no node
 *  - review & submit collapse: with/without declaration
 *  - review node state: current on declaration; done only when all constituents done
 *  - plain node state: done / current / locked
 *  - current beats done
 *  - repeatable grouping: base+~N run groups into one node
 *  - group state: current when any instance current; done only when all instances done
 *  - lone repeatable base becomes a one-instance group
 *  - non-repeatable step untouched by grouping
 *  - instance labels: no marker, marker with label, marker without label
 *  - resolveTitle callback used for labels; default titles when omitted
 *  - empty completedStepIds locks everything except current
 */

import { describe, it, expect } from "vitest";
import {
  buildProgressModel,
  NON_CONTENT_STEP_IDS,
} from "./build-progress-model";
import type { ClientFormStep, ClientPrimitive } from "@forms/types";
import type { RepeatableBehaviour } from "@govtech-bb/form-types";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function makeField(fieldId: string, stepId: string): ClientPrimitive {
  return {
    id: `${stepId}_${fieldId}`,
    fieldId,
    stepId,
    name: fieldId,
    label: fieldId,
    htmlType: "text",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
  };
}

function makeStep(
  stepId: string,
  opts: {
    title?: string;
    fieldIds?: string[];
    behaviours?: ClientFormStep["behaviours"];
  } = {},
): ClientFormStep {
  const { title = `Step ${stepId}`, fieldIds = [], behaviours } = opts;
  return {
    stepId,
    title,
    fields: fieldIds.map((fid) => makeField(fid, stepId)),
    behaviours,
  };
}

function makeRepeatableBehaviour(instanceLabel?: string): RepeatableBehaviour {
  return { type: "repeatable", min: 1, max: 5, instanceLabel };
}

// ---------------------------------------------------------------------------
// NON_CONTENT_STEP_IDS
// ---------------------------------------------------------------------------

describe("NON_CONTENT_STEP_IDS", () => {
  it("mirrors the conventional non-content step ids from review.tsx", () => {
    expect(NON_CONTENT_STEP_IDS).toEqual([
      "intro",
      "check-your-answers",
      "declaration",
      "submission-confirmation",
    ]);
  });
});

// ---------------------------------------------------------------------------
// ordering
// ---------------------------------------------------------------------------

describe("buildProgressModel ordering", () => {
  it("preserves the order of visibleSteps", () => {
    const steps = [makeStep("a"), makeStep("b"), makeStep("c")];
    const model = buildProgressModel(steps, "a", []);
    expect(model.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// exclusions
// ---------------------------------------------------------------------------

describe("buildProgressModel exclusions", () => {
  it("excludes intro and submission-confirmation entirely", () => {
    const steps = [
      makeStep("intro"),
      makeStep("a"),
      makeStep("submission-confirmation"),
    ];
    const model = buildProgressModel(steps, "a", []);
    expect(model.map((n) => n.id)).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// review & submit collapse
// ---------------------------------------------------------------------------

describe("buildProgressModel review & submit collapse", () => {
  it("collapses check-your-answers alone into one 'Review & submit' node", () => {
    const steps = [makeStep("a"), makeStep("check-your-answers")];
    const model = buildProgressModel(steps, "a", []);
    const reviewNodes = model.filter((n) => n.id === "check-your-answers");
    expect(reviewNodes).toHaveLength(1);
    expect(reviewNodes[0].label).toBe("Review & submit");
  });

  it("collapses check-your-answers + declaration into one node", () => {
    const steps = [
      makeStep("a"),
      makeStep("declaration"),
      makeStep("check-your-answers"),
    ];
    const model = buildProgressModel(steps, "a", []);
    expect(model.map((n) => n.id)).toEqual(["a", "check-your-answers"]);
  });

  it("targets the first present review step when check-your-answers is absent", () => {
    const steps = [makeStep("a"), makeStep("declaration")];
    const model = buildProgressModel(steps, "a", []);
    const reviewNode = model.find((n) => n.label === "Review & submit");
    // The node's id is the navigation target — it must be a step that is
    // actually in visibleSteps, never the hardcoded check-your-answers.
    expect(reviewNode?.id).toBe("declaration");
  });

  it("is current when currentStepId is declaration", () => {
    const steps = [
      makeStep("a"),
      makeStep("declaration"),
      makeStep("check-your-answers"),
    ];
    const model = buildProgressModel(steps, "declaration", []);
    const reviewNode = model.find((n) => n.id === "check-your-answers");
    expect(reviewNode?.state).toBe("current");
  });

  it("is done only when every constituent step id is completed", () => {
    const steps = [
      makeStep("a"),
      makeStep("declaration"),
      makeStep("check-your-answers"),
    ];
    const partial = buildProgressModel(steps, "a", ["declaration"]);
    expect(partial.find((n) => n.id === "check-your-answers")?.state).toBe(
      "locked",
    );

    const complete = buildProgressModel(steps, "a", [
      "declaration",
      "check-your-answers",
    ]);
    expect(complete.find((n) => n.id === "check-your-answers")?.state).toBe(
      "done",
    );
  });

  it("marks the Review & submit node with variant 'review' so it renders a flag instead of an ordinal", () => {
    const steps = [makeStep("a"), makeStep("check-your-answers")];
    const model = buildProgressModel(steps, "a", []);
    expect(model.find((n) => n.id === "check-your-answers")?.variant).toBe(
      "review",
    );
    expect(model.find((n) => n.id === "a")?.variant).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// plain node state
// ---------------------------------------------------------------------------

describe("buildProgressModel plain node state", () => {
  it("is done when the step id is in completedStepIds", () => {
    const steps = [makeStep("a"), makeStep("b")];
    const model = buildProgressModel(steps, "b", ["a"]);
    expect(model.find((n) => n.id === "a")?.state).toBe("done");
  });

  it("is current when the step id matches currentStepId", () => {
    const steps = [makeStep("a"), makeStep("b")];
    const model = buildProgressModel(steps, "b", ["a"]);
    expect(model.find((n) => n.id === "b")?.state).toBe("current");
  });

  it("is locked otherwise", () => {
    const steps = [makeStep("a"), makeStep("b"), makeStep("c")];
    const model = buildProgressModel(steps, "b", ["a"]);
    expect(model.find((n) => n.id === "c")?.state).toBe("locked");
  });

  it("prefers current over done when the step id is both", () => {
    const steps = [makeStep("a"), makeStep("b")];
    const model = buildProgressModel(steps, "a", ["a"]);
    expect(model.find((n) => n.id === "a")?.state).toBe("current");
  });

  it("locks everything except the current step when completedStepIds is empty", () => {
    const steps = [makeStep("a"), makeStep("b"), makeStep("c")];
    const model = buildProgressModel(steps, "b", []);
    expect(model.map((n) => n.state)).toEqual(["locked", "current", "locked"]);
  });
});

// ---------------------------------------------------------------------------
// repeatable grouping
// ---------------------------------------------------------------------------

describe("buildProgressModel repeatable grouping", () => {
  it("groups a base step + ~N run into one group node", () => {
    const steps = [
      makeStep("dependents", { behaviours: [makeRepeatableBehaviour()] }),
      makeStep("dependents~1", { behaviours: [makeRepeatableBehaviour()] }),
      makeStep("dependents~2", { behaviours: [makeRepeatableBehaviour()] }),
    ];
    const model = buildProgressModel(steps, "dependents", []);
    expect(model).toHaveLength(1);
    expect(model[0].kind).toBe("group");
    expect(model[0].id).toBe("dependents");
    expect(model[0].instances?.map((i) => i.stepId)).toEqual([
      "dependents",
      "dependents~1",
      "dependents~2",
    ]);
  });

  it("is current when any instance is the current step", () => {
    const steps = [
      makeStep("dependents", { behaviours: [makeRepeatableBehaviour()] }),
      makeStep("dependents~1", { behaviours: [makeRepeatableBehaviour()] }),
    ];
    const model = buildProgressModel(steps, "dependents~1", []);
    expect(model[0].state).toBe("current");
  });

  it("is done only when every instance is done", () => {
    const steps = [
      makeStep("dependents", { behaviours: [makeRepeatableBehaviour()] }),
      makeStep("dependents~1", { behaviours: [makeRepeatableBehaviour()] }),
      makeStep("dependents~2", { behaviours: [makeRepeatableBehaviour()] }),
    ];
    const partial = buildProgressModel(steps, "elsewhere", [
      "dependents",
      "dependents~1",
    ]);
    expect(partial[0].state).toBe("locked");

    const complete = buildProgressModel(steps, "elsewhere", [
      "dependents",
      "dependents~1",
      "dependents~2",
    ]);
    expect(complete[0].state).toBe("done");
  });

  it("turns a lone repeatable base step into a one-instance group", () => {
    const steps = [
      makeStep("dependents", { behaviours: [makeRepeatableBehaviour()] }),
    ];
    const model = buildProgressModel(steps, "dependents", []);
    expect(model[0].kind).toBe("group");
    expect(model[0].instances).toHaveLength(1);
  });

  it("leaves a non-repeatable step as a plain node, untouched by grouping", () => {
    const steps = [makeStep("a"), makeStep("b")];
    const model = buildProgressModel(steps, "a", []);
    expect(model.every((n) => n.kind === "step")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// instance labels
// ---------------------------------------------------------------------------

describe("buildProgressModel instance labels", () => {
  it("uses resolveTitle for the first instance (no marker)", () => {
    const steps = [
      makeStep("dependents", {
        title: "Dependents",
        behaviours: [makeRepeatableBehaviour()],
      }),
    ];
    const model = buildProgressModel(steps, "dependents", []);
    expect(model[0].instances?.[0].label).toBe("Dependents");
  });

  it("uses the marker text directly when the behaviour has an instanceLabel", () => {
    const steps = [
      makeStep("dependents", {
        title: "Dependents",
        behaviours: [makeRepeatableBehaviour("Dependent")],
      }),
      makeStep("dependents~1", {
        title: "Dependents",
        behaviours: [makeRepeatableBehaviour("Dependent")],
      }),
    ];
    const model = buildProgressModel(steps, "dependents", []);
    expect(model[0].instances?.[1].label).toBe("Dependent 2");
  });

  it("suffixes the resolved title with the marker text when there's no instanceLabel", () => {
    const steps = [
      makeStep("dependents", {
        title: "Dependents",
        behaviours: [makeRepeatableBehaviour()],
      }),
      makeStep("dependents~1", {
        title: "Dependents",
        behaviours: [makeRepeatableBehaviour()],
      }),
    ];
    const model = buildProgressModel(steps, "dependents", []);
    expect(model[0].instances?.[1].label).toBe("Dependents 2");
  });
});

// ---------------------------------------------------------------------------
// resolveTitle callback
// ---------------------------------------------------------------------------

describe("buildProgressModel resolveTitle callback", () => {
  it("uses the provided resolveTitle callback for labels", () => {
    const steps = [makeStep("a", { title: "A" })];
    const model = buildProgressModel(steps, "a", [], () => "Custom Title");
    expect(model[0].label).toBe("Custom Title");
  });

  it("defaults to the step's title when resolveTitle is omitted", () => {
    const steps = [makeStep("a", { title: "A" })];
    const model = buildProgressModel(steps, "a", []);
    expect(model[0].label).toBe("A");
  });
});
