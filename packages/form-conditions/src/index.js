"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateFormConditions = evaluateFormConditions;
const internals_1 = require("./internals");
function evaluateFormConditions(contract, values) {
    const flatValues = (0, internals_1.flattenStepValues)(values);
    const result = {
        activeStepIds: new Set(),
        hiddenStepIds: new Set(),
        activeFieldIds: new Map(),
        hiddenFieldIds: new Map(),
    };
    for (const step of contract.steps) {
        const stepConditions = (step.behaviours ?? []).filter((b) => b.type === "stepConditionalOn");
        const stepActive = stepConditions.length === 0 ||
            stepConditions.every((b) => (0, internals_1.evaluateCondition)(b, values, flatValues));
        if (!stepActive) {
            result.hiddenStepIds.add(step.stepId);
            const hidden = new Set(step.elements.map((p) => p.fieldId));
            result.hiddenFieldIds.set(step.stepId, hidden);
            continue;
        }
        result.activeStepIds.add(step.stepId);
        const activeInStep = new Set();
        const hiddenInStep = new Set();
        for (const primitive of step.elements) {
            const fieldConditions = (primitive.behaviours ?? []).filter((b) => b.type === "fieldConditionalOn");
            const fieldActive = fieldConditions.length === 0 ||
                fieldConditions.every((b) => (0, internals_1.evaluateCondition)(b, values, flatValues));
            if (fieldActive) {
                activeInStep.add(primitive.fieldId);
            }
            else {
                hiddenInStep.add(primitive.fieldId);
            }
        }
        result.activeFieldIds.set(step.stepId, activeInStep);
        if (hiddenInStep.size > 0) {
            result.hiddenFieldIds.set(step.stepId, hiddenInStep);
        }
    }
    return result;
}
//# sourceMappingURL=index.js.map