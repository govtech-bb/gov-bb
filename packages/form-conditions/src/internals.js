"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenStepValues = flattenStepValues;
exports.evaluateCondition = evaluateCondition;
function flattenStepValues(values) {
    return Object.values(values).reduce((acc, stepValues) => ({ ...acc, ...stepValues }), {});
}
function resolveTargetValue(behaviour, values, flatValues) {
    if (behaviour.targetStepId) {
        return values[behaviour.targetStepId]?.[behaviour.targetFieldId];
    }
    return flatValues[behaviour.targetFieldId];
}
function evaluateCondition(behaviour, values, flatValues) {
    const target = resolveTargetValue(behaviour, values, flatValues);
    switch (behaviour.operator) {
        case "equal":
            return target === behaviour.value;
        case "notEqual":
            return target !== behaviour.value;
        case "in": {
            const list = behaviour.value;
            return Array.isArray(list) && list.includes(target);
        }
        case "exists":
            return target !== undefined && target !== null && target !== "";
        default:
            return false;
    }
}
//# sourceMappingURL=internals.js.map