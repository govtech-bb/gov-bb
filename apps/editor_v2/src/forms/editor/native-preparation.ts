import type { SerializedEditorState } from "lexical";
import type { FormEditorDefinition } from "../definition";
import { nativeDiagnostic, type NativeDiagnostic } from "../schema/diagnostics";
import type { PageBlock, VisibilityTarget } from "../schema/types";
import { sourceFieldForNode } from "../source/field";
import { sourceContentForNode } from "../source/content";
import { calculatedFields, conditionalLogic } from "../core/logic";
import type { Settings } from "../core/settings";
import { sourceSlug } from "../source/identifiers";
import { rawNative, type NativeRawNode, type NativeNodeData } from "./native-state";
import { applyNativeQuestionSettings, nativeQuestionSettings } from "./native-settings";
import { nativeFormSettings } from "./native-form-settings";
import { validatePageNode } from "./page-settings";
import {
  legacyNativeAction,
  legacyNativeCondition,
  legacyNativeReference,
  type LegacyNativeReferences,
} from "./native-legacy-logic";

// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Legacy NodeState settings are migration input; preparation diagnostics and native export validation decide whether the candidate is usable.
const settings = (node: NativeRawNode) => (node.$?.settings ?? {}) as Settings;

const text = (node: NativeRawNode): string =>
  typeof node.text === "string" ? node.text : (node.children ?? []).map(text).join("");

const depth = (node: NativeRawNode) => Number(node.$?.depth ?? 0);

// SAFETY: The condition checks a non-null non-array object; every property remains unknown.
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const pin = (node: NativeRawNode, patch: Partial<NativeNodeData>) => {
  node.$ = { ...node.$, native: { ...rawNative(node), ...patch } };
};

const identity = (node: NativeRawNode) => {
  const id = node.$?.id;

  if (typeof id === "string" && id) return id;
  const next = crypto.randomUUID();
  node.$ = { ...node.$, id: next };

  return next;
};

/** One-time authoring upgrade. Failure returns the untouched editable draft with located diagnostics. */
export function prepareNativeBindings(
  state: SerializedEditorState,
  definition: FormEditorDefinition,
) {
  const candidate = structuredClone(state);
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Legacy Lexical JSON retains extension NodeState beyond base serialized types; preparation inspects it without changing the original draft.
  const nodes = candidate.root.children as NativeRawNode[];
  const title = nodes[0];

  if (!title || title.type !== "form-title")
    return {
      state,
      migrated: false,
      diagnostics: [
        nativeDiagnostic("native-preparation", "The form needs a service name block", []),
      ],
    };

  const pageDiagnostics = nodes.flatMap((node, index) => {
    const error = validatePageNode(node);

    return error ? [nativeDiagnostic("native-preparation", error, ["blocks", index])] : [];
  });

  if (pageDiagnostics.length) return { state, migrated: false, diagnostics: pageDiagnostics };

  if (rawNative(title).version === 1) return { state, migrated: false, diagnostics: [] };
  const diagnostics: NativeDiagnostic[] = [];

  const issue = (node: NativeRawNode, message: string) =>
    diagnostics.push({
      code: "native-preparation",
      severity: "error",
      message,
      path: ["blocks", nodes.indexOf(node)],
      blockId: identity(node),
    });

  const allowed = new Set([
    "logicVersion",
    "field",
    "fieldId",
    "sourceFieldId",
    "sourceKey",
    "sourceLabel",
    "sourcePreset",
    "sourceExplicit",
    "ref",
    "name",
    "folded",
    "required",
    "hidden",
    "hideLabel",
    "isDisabled",
    "width",
    "placeholder",
    "mask",
    "step",
    "hasDefaultAnswer",
    "defaultAnswer",
    "hasMinCharacters",
    "minCharacters",
    "hasMaxCharacters",
    "maxCharacters",
    "hasMinNumber",
    "minNumber",
    "hasMaxNumber",
    "maxNumber",
    "hasMinChoices",
    "minChoices",
    "hasMaxChoices",
    "maxChoices",
    "hasMinAge",
    "minAge",
    "hasMaxAge",
    "maxAge",
    "hasMinFiles",
    "minFiles",
    "hasMaxFiles",
    "maxFiles",
    "hasMaxFileSize",
    "maxFileSize",
    "pattern",
    "beforeDate",
    "afterDate",
    "errors",
    "fieldArray",
    "repeatable",
    "button",
    "backButton",
    "pageId",
    "pageType",
    "confirmation",
    "formSettings",
    "optionValue",
    "sourceOptionValue",
    "conditionals",
    "actions",
    "logicalOperator",
    "calculatedFields",
  ]);

  for (const node of nodes)
    for (const key of Object.keys(settings(node)))
      if (!allowed.has(key))
        issue(
          node,
          `Preserve or explicitly map the legacy setting “${key}” before native conversion`,
        );
  const formSettings = object(settings(title).formSettings);

  for (const key of Object.keys(formSettings))
    if (
      ![
        "formId",
        "description",
        "visibility",
        "closingDateTime",
        "contactDetails",
        "applicantEmail",
        "departmentEmail",
      ].includes(key)
    )
      issue(title, `The legacy form setting “${key}” has no native mapping`);
  const contact = object(formSettings.contactDetails);
  const applicant = object(formSettings.applicantEmail);
  const department = object(formSettings.departmentEmail);

  for (const [value, keys, name] of [
    [contact, ["title", "email", "telephone", "address", "website"], "contact details"],
    [applicant, ["question", "subject"], "applicant email"],
    [department, ["off", "to", "subject"], "department email"],
  ] as const)
    for (const key of Object.keys(value))
      if (!keys.some((allowed) => allowed === key))
        issue(title, `Preserve the unknown ${name} property “${key}” before native conversion`);

  const inspectState = (node: NativeRawNode) => {
    for (const key of Object.keys(node.$ ?? {}))
      if (!["settings", "id", "depth", "sourceAnchor", "index", "listIndex"].includes(key))
        issue(node, `The legacy node state “${key}” requires a native mapping`);
    node.children?.forEach(inspectState);
  };

  nodes.forEach(inspectState);

  for (const node of nodes) {
    const raw = settings(node);

    for (const key of [
      "required",
      "hidden",
      "hideLabel",
      "isDisabled",
      "hasDefaultAnswer",
      "hasMinCharacters",
      "hasMaxCharacters",
      "hasMinNumber",
      "hasMaxNumber",
      "hasMinChoices",
      "hasMaxChoices",
      "hasMinAge",
      "hasMaxAge",
      "hasMinFiles",
      "hasMaxFiles",
      "hasMaxFileSize",
      "confirmation",
    ])
      if (raw[key] !== undefined && typeof raw[key] !== "boolean")
        issue(node, `The legacy setting “${key}” must be a boolean before native conversion`);
  }

  if (
    (department.off !== undefined && department.off !== true) ||
    (department.to !== undefined && department.to !== "contactDetails.email")
  )
    issue(
      title,
      "The legacy department notification needs an explicit native recipient and enabled state",
    );
  pin(title, {
    version: 1,
    form: {
      schemaVersion: 2,
      id:
        typeof formSettings.formId === "string" && formSettings.formId
          ? formSettings.formId
          : `form-${identity(title)}`,
      mode: "application",
      locale: "en-BB",
      timeZone: "America/Barbados",
      ...(typeof formSettings.description === "string" && {
        description: formSettings.description,
      }),
      settings: {
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the authored launch value in the migration candidate; native form validation reports unsupported visibility values.
        visibility: (formSettings.visibility ?? "preview") as "preview",
        hiddenAnswers: "retain",
        ...(formSettings.closingDateTime !== undefined && {
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the authored closing value in the migration candidate; native form validation owns the timestamp contract.
          closingDateTime: formSettings.closingDateTime as string,
        }),
        ...(Object.keys(contact).length && {
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Legacy contact data may contain an unfinished address; native form validation reports required address fields without discarding edits.
          contact: contact as NonNullable<NativeNodeData["form"]>["settings"]["contact"],
        }),
        notifications: {
          department: {
            enabled: department.off !== true,
            recipient:
              department.to === "contactDetails.email"
                ? { contact: "email" }
                : { context: "departmentEmail" },
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the legacy department subject in the candidate; native notification validation checks its type before export.
            ...(department.subject !== undefined && { subject: department.subject as string }),
          },
          ...(applicant.question !== undefined && {
            applicant: {
              enabled: true,
              // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the legacy applicant answer reference; native reference validation checks its target before export.
              recipient: { answer: applicant.question as string },
              // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the legacy applicant subject in the candidate; native notification validation checks its type before export.
              ...(applicant.subject !== undefined && { subject: applicant.subject as string }),
            },
          }),
        },
      },
    },
  });
  title.$!.settings = {
    ...settings(title),
    formSettings: nativeFormSettings(rawNative(title).form!),
  };

  const answerNodes = nodes.filter((node) =>
    sourceFieldForNode(
      definition.fields.map((field) => field.source),
      node,
    ),
  );

  const questions = new Map<string, NativeRawNode[]>();
  const targets = new Map<string, VisibilityTarget>();
  const options = new Map<string, { question: string; option: string }>();

  const values = new Set<string>(),
    textValues = new Set<string>();

  const refs: LegacyNativeReferences = { values, textValues, options, targets };
  const usedKeys = new Set<string>();

  for (const node of answerNodes) {
    const field = settings(node).field;
    const id = typeof field === "string" ? field : identity(node);

    const group = questions.get(id) ?? [];
    group.push(node);
    questions.set(id, group);
  }

  for (const [id, answers] of questions) {
    const answer = answers[0]!;

    const source = sourceFieldForNode(
      definition.fields.map((field) => field.source),
      answer,
    )!;

    const field = definition.fields.find((field) => field.kind === source.kind)!;

    if (!field.native) {
      issue(answer, `Install a native mapping for ${field.kind}`);
      continue;
    }

    const raw = settings(answer);
    let before = nodes.indexOf(answer) - 1;
    const hints: NativeRawNode[] = [];

    while (
      before >= 0 &&
      depth(nodes[before]!) === depth(answer) &&
      ["paragraph", "heading"].includes(nodes[before]!.type)
    )
      hints.unshift(nodes[before--]!);

    const label =
      nodes[before]?.type === "question" && depth(nodes[before]!) === depth(answer)
        ? nodes[before]
        : undefined;

    const base = String(
      raw.fieldId ??
        raw.sourceFieldId ??
        raw.sourceKey ??
        sourceSlug(label ? text(label) : field.kind),
    );

    let key = base,
      n = 2;

    while (usedKeys.has(key)) key = `${base}-${n++}`;
    usedKeys.add(key);

    let metadata: NonNullable<NativeNodeData["question"]> = {
      id,
      type: "question",
      kind: field.native.kind,
      key,
      ...(field.native.config && { config: { ...field.native.config } }),
    };

    const shared = { ...raw };

    if (source.choice) delete shared.hidden;
    metadata = applyNativeQuestionSettings(metadata, shared, shared);

    if (label && settings(label).hidden !== undefined)
      metadata.parts = { ...metadata.parts, label: { visible: settings(label).hidden !== true } };
    const errors = object(raw.errors);

    if (!metadata.required && typeof errors.required === "string")
      metadata.required = { value: false, message: errors.required };
    const projectedErrors = object(nativeQuestionSettings(metadata).errors);

    for (const key of Object.keys(errors))
      if (!Object.hasOwn(projectedErrors, key))
        issue(answer, `The legacy validation message “${key}” needs a native validation rule`);

    if (label) {
      pin(label, { owner: id, part: "label" });
      targets.set(identity(label), { question: id, part: "label" });
    }

    if (label && hints.length > 1)
      issue(
        answer,
        "Combine or structure the multiple legacy hint paragraphs before native conversion",
      );

    if (label)
      for (const hint of hints) {
        // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- hintShape is a persisted Markdown metadata key; renaming would discard saved hint representation.
        pin(hint, { owner: id, part: "hint", hintShape: "rich" });
        targets.set(identity(hint), { question: id, part: "hint" });
      }

    if (field.native.valueType === "string") textValues.add(id);

    for (const member of answers) {
      pin(member, { question: metadata, owner: id, part: source.choice ? "option" : "input" });
      member.$!.settings = { ...settings(member), ...nativeQuestionSettings(metadata) };
      targets.set(
        identity(member),
        source.choice
          ? { question: id, option: identity(member) }
          : { question: id, part: "input" },
      );

      if (source.choice) {
        const own = settings(member);
        pin(member, {
          option: {
            id: identity(member),
            value:
              // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain explicit legacy option values unchanged; native option validation reports incompatible scalar types before export.
              (own.optionValue as string) ??
              // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain explicit legacy option values unchanged; native option validation reports incompatible scalar types before export.
              (own.sourceOptionValue as string) ??
              sourceSlug(text(member)),
            ...(own.hidden !== undefined && { visible: !own.hidden }),
          },
        });
        options.set(identity(member), { question: id, option: identity(member) });
      }
    }
  }

  for (const node of nodes)
    if (node.type === "widget" && node.widget === "calculated-fields") {
      const fields = calculatedFields(settings(node));

      if (fields.length !== 1 || !fields[0]?.type) {
        issue(node, "Split this legacy calculated block into one native value per block");
        continue;
      }

      const field = fields[0];
      const id = `${identity(node)}:${field.id}`;
      values.add(id);

      if (field.type === "TEXT") textValues.add(id);

      for (const key of Object.keys(field))
        if (!["id", "name", "type", "value"].includes(key))
          issue(node, `The calculated value property “${key}” needs a native mapping`);
      pin(node, {
        calculated: {
          id,
          type: "calculated",
          valueType: field.type === "NUMBER" ? "number" : "string",
          ...(field.name !== undefined && { name: field.name }),
        },
      });
    }

  for (const [index, node] of nodes.entries()) {
    const raw = settings(node),
      native = rawNative(node);

    if (
      node.type === "form-title" ||
      (node.type === "widget" && (node.widget ?? "page-break") === "page-break")
    ) {
      const role: PageBlock["role"] = raw.confirmation
        ? "confirmation"
        : raw.pageType === "check-answers"
          ? "review"
          : raw.pageType === "declaration"
            ? "declaration"
            : raw.pageType === "result"
              ? "result"
              : "questions";

      const repeat = object(raw.repeatable);

      const page: NonNullable<NativeNodeData["page"]> = {
        id: identity(node),
        type: "page",
        role,
        ...(raw.hidden !== undefined && { visible: !raw.hidden }),
        ...(role === "review" && {
          review: { questions: "preceding", emptyAnswers: "omit", changeLinks: true },
        }),

        ...(raw.repeatable !== undefined && {
          repeat: {
            key: `${identity(node)}-items`,
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Legacy repeat settings are migration input; native repeat validation checks their bounds before export.
            min: repeat.min as number,
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Legacy repeat settings are migration input; native repeat validation checks their bounds before export.
            ...(repeat.max !== undefined && { max: repeat.max as number }),
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the authored repeat button text; native repeat validation checks its string contract before export.
            addLabel: repeat.addAnotherLabel as string,
            ...(repeat.instanceLabel !== undefined && {
              // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the authored repeat item label; native repeat validation checks its string contract before export.
              itemLabel: repeat.instanceLabel as string,
            }),
          },
        }),
      };

      if (raw.button !== undefined || raw.backButton !== undefined) {
        page.navigation = {};

        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the authored next-button label; native navigation validation checks its string contract before export.
        if (raw.button !== undefined) page.navigation.nextLabel = raw.button as string;

        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain the authored back-button label; native navigation validation checks its string contract before export.
        if (raw.backButton !== undefined) page.navigation.backLabel = raw.backButton as string;
      }

      pin(node, { page });

      if (nodes[index + 1]?.type === "page-title")
        pin(nodes[index + 1]!, { owner: identity(node) });

      if (nodes[index + 2]?.type === "page-description")
        pin(nodes[index + 2]!, { owner: identity(node) });
      continue;
    }

    if (native.question || native.owner || ["page-title", "page-description"].includes(node.type))
      continue;

    if (native.calculated) {
      const field = calculatedFields(raw)[0]!;
      const value = field.value;

      if (value === null) issue(node, "Complete this calculated value before native conversion");
      else if (value !== undefined && !Array.isArray(value)) {
        try {
          pin(node, {
            calculated: {
              ...native.calculated,
              expression:
                typeof value === "object" ? legacyNativeReference(value.field, refs) : value,
            },
          });
        } catch (error) {
          issue(node, error instanceof Error ? error.message : String(error));
        }
      } else if (Array.isArray(value))
        issue(node, "A calculated value cannot start with this legacy collection");
      continue;
    }

    if (node.type === "widget" && node.widget === "conditional-logic") {
      try {
        const logic = conditionalLogic(raw);
        pin(node, {
          logic: {
            id: identity(node),
            type: "logic",
            rules: [
              {
                id: `${identity(node)}-rule`,
                when: {
                  op: logic.logicalOperator === "OR" ? "any" : "all",
                  conditions: logic.conditionals.map((condition) =>
                    legacyNativeCondition(condition, refs),
                  ),
                },
                actions: logic.actions.map((action) => legacyNativeAction(action, refs)),
              },
            ],
          },
        });
      } catch (error) {
        issue(node, error instanceof Error ? error.message : String(error));
      }

      continue;
    }

    const source = sourceContentForNode(
      definition.contents.map((content) => content.source),
      node,
    );

    const content = source && definition.contents.find((content) => content.kind === source.kind);

    if (!content?.native) {
      if (!(node.type === "paragraph" && !text(node)))
        issue(node, `Install a native mapping for ${source?.kind ?? node.type}`);
      continue;
    }

    if (["list", "expandable"].includes(content.native.kind)) {
      issue(node, "This structured content needs native item and containment bindings");
      continue;
    }

    pin(node, {
      content: {
        id: identity(node),
        type: "content",
        kind: content.native.kind,
        ...(content.native.config && { config: { ...content.native.config } }),
        ...(raw.hidden !== undefined && { visible: !raw.hidden }),
      },
    });
  }

  const bindMentions = (node: NativeRawNode) => {
    if (node.type === "mention" && !node.$?.nativeReference) {
      try {
        const reference = legacyNativeReference(String(node.field ?? ""), refs);
        node.$ = {
          ...node.$,
          nativeReference: node.defaultValue
            ? { ...reference, fallback: node.defaultValue }
            : reference,
        };
      } catch (error) {
        issue(node, error instanceof Error ? error.message : String(error));
      }
    }

    node.children?.forEach(bindMentions);
  };

  nodes.forEach(bindMentions);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!,
      native = rawNative(node);

    if (!native.page || nodes[i + 1]?.type === "page-title") continue;
    nodes.splice(i + 1, 0, {
      type: "page-title",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      children: [
        {
          type: "text",
          version: 1,
          text:
            native.page.role === "review"
              ? "Check your answers"
              : native.page.role === "declaration"
                ? "Declaration"
                : "",
          format: 0,
          mode: "normal",
          style: "",
          detail: 0,
        },
      ],
      $: { id: `title:${native.page.id}`, native: { owner: native.page.id } },
    });
  }

  return diagnostics.length
    ? { state, migrated: false, diagnostics }
    : { state: candidate, migrated: true, diagnostics: [] };
}
