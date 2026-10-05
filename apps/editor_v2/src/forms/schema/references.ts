import type { NativePath } from "./diagnostics";
import type {
  AnyFormBlock,
  AnyFormDefinition,
  Condition,
  ContentBlock,
  Expression,
  FormBlock,
  NativeScope,
  RichText,
  RichTextInline,
  VisibilityTarget,
} from "./types";

export type NativeReference = {
  kind: "answer" | "value" | "context" | "block" | "question" | "page" | "option" | "list-item";
  id: string;
  ownerId?: string;
  scope?: NativeScope;
  path: NativePath;
  blockId?: string;
};

export type NativeReferenceVisitor = (reference: NativeReference) => void;

// The hint contract has homogeneous content-block or inline arrays.
function isContentHint(hint: RichText | ContentBlock[] | undefined): hint is ContentBlock[] {
  return (
    Array.isArray(hint) &&
    hint.length > 0 &&
    typeof hint[0] === "object" &&
    "type" in hint[0] &&
    hint[0].type === "content"
  );
}

/** Visits structural reference positions only. Literal strings, keys, and submitted option values are never references. */
export function visitNativeBlockReferences(
  input: AnyFormBlock,
  visitor: NativeReferenceVisitor,
  path: NativePath = [],
): void {
  // SAFETY: Built-in kinds own the config layouts visited below. Custom kinds use
  // their module reference handlers; this projection does not validate draft completeness.
  const block = input as FormBlock;

  const emit = (
    kind: NativeReference["kind"],
    id: string,
    at: NativePath,
    scope?: NativeScope,
    ownerId?: string,
  ) => {
    const reference: NativeReference = { kind, id, path: at, blockId: block.id };

    if (scope !== undefined) reference.scope = scope;

    if (ownerId !== undefined) reference.ownerId = ownerId;
    visitor(reference);
  };

  const reference = (
    value: Exclude<Expression | RichTextInline, string | number | boolean>,
    at: NativePath,
  ): boolean => {
    if ("answer" in value) {
      emit(
        "answer",
        String(value.answer),
        [...at, "answer"],
        "scope" in value ? value.scope : undefined,
      );

      return true;
    }

    if ("value" in value && !("op" in value)) {
      emit(
        "value",
        String(value.value),
        [...at, "value"],
        "scope" in value ? value.scope : undefined,
      );

      return true;
    }

    if ("context" in value) {
      emit("context", String(value.context), [...at, "context"]);

      return true;
    }

    return false;
  };

  const text = (value: RichText | undefined, at: NativePath): void => {
    if (!Array.isArray(value)) return;
    value.forEach((inline, index) => {
      if (typeof inline !== "object") return;
      const where = [...at, index];

      if (!reference(inline, where) && "link" in inline)
        text(inline.content, [...where, "content"]);
    });
  };

  const expression = (value: Expression, at: NativePath): void => {
    if (typeof value !== "object" || reference(value, at)) return;

    if ("op" in value) {
      value.args.forEach((arg, index) => expression(arg, [...at, "args", index]));

      if (value.op === "lookup") {
        value.entries.forEach((entry, index) =>
          expression(entry.value, [...at, "entries", index, "value"]),
        );
        expression(value.fallback, [...at, "fallback"]);
      }
    }
  };

  const condition = (value: Condition, at: NativePath): void => {
    if (typeof value === "boolean") return;

    if (value.op === "all" || value.op === "any")
      value.conditions.forEach((child, index) => condition(child, [...at, "conditions", index]));
    else if (value.op === "not") condition(value.condition, [...at, "condition"]);
    else if (value.op === "empty") expression(value.value, [...at, "value"]);
    else if (value.op === "selected") {
      emit("question", value.question, [...at, "question"], value.scope);
      emit("option", value.option, [...at, "option"], value.scope, value.question);
    } else if ("left" in value) {
      expression(value.left, [...at, "left"]);
      expression(value.right, [...at, "right"]);
    }
  };

  const target = (value: VisibilityTarget, at: NativePath): void => {
    if (typeof value === "string") emit("block", value, at);
    else if ("question" in value) {
      emit("question", value.question, [...at, "question"]);

      if ("option" in value)
        emit("option", value.option, [...at, "option"], undefined, value.question);
    } else {
      emit("block", value.list, [...at, "list"]);
      emit("list-item", value.item, [...at, "item"], undefined, value.list);
    }
  };

  if ("layout" in block && block.layout) {
    const under = block.layout.under,
      at = [...path, "layout", "under"];

    if ("block" in under) emit("block", under.block, [...at, "block"]);
    else target(under, at);
  }

  switch (block.type) {
    case "page":
      text(block.title, [...path, "title"]);
      text(block.description, [...path, "description"]);
      break;
    case "question": {
      text(block.label, [...path, "label"]);

      if (isContentHint(block.hint))
        block.hint.forEach((child, index) =>
          visitNativeBlockReferences(child, visitor, [...path, "hint", index]),
        );
      else text(block.hint, [...path, "hint"]);
      block.options?.forEach((option, index) =>
        text(option.label, [...path, "options", index, "label"]),
      );

      if (block.kind === "choice")
        block.config?.groups?.forEach((group, index) => {
          text(group.label, [...path, "config", "groups", index, "label"]);
          group.optionIds.forEach((id, option) =>
            emit(
              "option",
              id,
              [...path, "config", "groups", index, "optionIds", option],
              undefined,
              block.id,
            ),
          );
        });
      block.validation?.forEach((rule, index) => {
        if (rule.type === "dateAfter" || rule.type === "dateBefore")
          expression(rule.value, [...path, "validation", index, "value"]);
      });
      break;
    }

    case "content":
      text(block.content, [...path, "content"]);

      if (block.kind === "list")
        block.config?.items.forEach((item, index) =>
          text(item.content, [...path, "config", "items", index, "content"]),
        );

      if (block.kind === "expandable")
        block.config?.blocks.forEach((child, index) =>
          visitNativeBlockReferences(child, visitor, [...path, "config", "blocks", index]),
        );
      break;
    case "calculated":
      if (block.expression !== undefined) expression(block.expression, [...path, "expression"]);
      break;
    case "logic":
      block.rules.forEach((rule, ruleIndex) => {
        const at = [...path, "rules", ruleIndex];
        condition(rule.when, [...at, "when"]);
        rule.actions.forEach((action, index) => {
          const actionPath = [...at, "actions", index];

          if (action.type === "setVisible")
            action.targets.forEach((item, targetIndex) =>
              target(item, [...actionPath, "targets", targetIndex]),
            );
          else if ("target" in action)
            emit(
              action.type === "setValue"
                ? "value"
                : action.type === "setTitle" || action.type === "goTo"
                  ? "page"
                  : action.type === "setRequired" || action.type === "setLabel"
                    ? "question"
                    : "block",
              action.target,
              [...actionPath, "target"],
            );

          if (action.type === "setValue") expression(action.value, [...actionPath, "value"]);
          else if (action.type === "setLabel" || action.type === "setTitle")
            text(action.value, [...actionPath, "value"]);
        });
      });
      break;
  }
}

export function visitNativeReferences(
  form: AnyFormDefinition,
  visitor: NativeReferenceVisitor,
): void {
  form.blocks.forEach((block, index) =>
    visitNativeBlockReferences(block, visitor, ["blocks", index]),
  );

  if (form.description !== undefined)
    visitNativeBlockReferences(
      { id: form.id, type: "content", kind: "paragraph", content: form.description },
      (ref) => visitor({ ...ref, path: ["description", ...ref.path.slice(1)], blockId: undefined }),
      [],
    );
  const applicant = form.settings.notifications?.applicant;

  if (applicant)
    visitor({
      kind: "answer",
      id: applicant.recipient.answer,
      scope: "form",
      path: ["settings", "notifications", "applicant", "recipient", "answer"],
    });
}

export type NativeIdentityMaps = {
  blocks: ReadonlyMap<string, string>;
  options?: ReadonlyMap<string, ReadonlyMap<string, string>>;
  listItems?: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Keyed by the original owning block ID, not by an ambiguous scope-local submitted key. */
  keys?: ReadonlyMap<string, string>;
};

export function remapNativeForm(
  form: AnyFormDefinition,
  maps: NativeIdentityMaps,
): AnyFormDefinition {
  const result = structuredClone(form);

  const setPath = (path: NativePath, value: string) => {
    let object: unknown = result;

    for (const part of path.slice(0, -1)) {
      // SAFETY: The visitor emits paths from form itself; result is its detached clone.
      // Traversal retains unknown values and only the final emitted reference is overwritten.
      object = (object as Record<string | number, unknown>)[part];
    }

    // SAFETY: The final parent/key exists in the same clone for the emitted reference path.
    (object as Record<string | number, unknown>)[path[path.length - 1]!] = value;
  };

  visitNativeReferences(form, (reference) => {
    if (reference.kind === "context") return;

    const mapped =
      reference.kind === "option"
        ? maps.options?.get(reference.ownerId!)?.get(reference.id)
        : reference.kind === "list-item"
          ? maps.listItems?.get(reference.ownerId!)?.get(reference.id)
          : maps.blocks.get(reference.id);

    if (mapped !== undefined) setPath(reference.path, mapped);
  });

  const own = (input: AnyFormBlock) => {
    // SAFETY: Only built-in kind-owned identity slots are inspected here; custom
    // configuration remains opaque and is remapped by its installed module handler.
    const block = input as FormBlock;
    const old = block.id;
    block.id = maps.blocks.get(old) ?? old;

    if (block.type === "question") {
      if (maps.keys?.has(old)) block.key = maps.keys.get(old)!;
      block.options?.forEach((option) => {
        option.id = maps.options?.get(old)?.get(option.id) ?? option.id;
      });

      if (Array.isArray(block.hint))
        for (const child of block.hint)
          if (typeof child === "object" && "type" in child && child.type === "content") own(child);
    } else if (block.type === "page" && block.repeat && maps.keys?.has(old))
      block.repeat.key = maps.keys.get(old)!;
    else if (block.type === "calculated" && block.key !== undefined && maps.keys?.has(old))
      block.key = maps.keys.get(old)!;
    else if (block.type === "content" && block.kind === "list")
      block.config?.items.forEach((item) => {
        item.id = maps.listItems?.get(old)?.get(item.id) ?? item.id;
      });
    else if (block.type === "content" && block.kind === "expandable")
      block.config?.blocks.forEach(own);
  };

  result.blocks.forEach(own);

  return result;
}
