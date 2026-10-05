import { jsonSettings, settingText } from "../helpers/serialized-test-data";
import { createElement } from "react";
import {
  $createDrawnInput,
  defineField,
  defineNativeField,
  fieldModule,
  type BlockMenuActions,
  type BlockMenuModel,
  type Settings,
} from "../../src/forms";

export type ReferenceSettings = { code?: string; peer?: string; required?: boolean };

const read = (raw: Settings): ReferenceSettings => ({
  code: typeof raw.code === "string" ? raw.code : undefined,
  peer: typeof raw.peer === "string" ? raw.peer : undefined,
  required: !!raw.required,
});

type ReferenceConfig = {
  code?: string;
  peer?: string;
  opaque?: { literal: string; token: string };
};

const configOf = (value: unknown): ReferenceConfig => {
  const raw = jsonSettings(value ?? {});
  const result: ReferenceConfig = {};

  if (raw.code !== undefined) result.code = settingText(raw.code);

  if (raw.peer !== undefined) result.peer = settingText(raw.peer);

  if (raw.opaque !== undefined) {
    const opaque = jsonSettings(raw.opaque);
    result.opaque = { literal: settingText(opaque.literal), token: settingText(opaque.token) };
  }

  return result;
};

export const referenceField = defineField({
  native: defineNativeField<
    "reference-code",
    { code?: string; peer?: string; opaque?: { literal: string; token: string } }
  >({
    kind: "reference-code",
    valueType: "string",
    validate: (block, path) =>
      block.config?.code !== undefined && !/^[A-Z]{3}$/.test(block.config.code)
        ? [
            {
              code: "reference-code",
              severity: "error",
              path: [...path, "config", "code"],
              message: "Use three uppercase letters for the reference code",
            },
          ]
        : [],
    references: (block, visit) => ({
      ...block,
      config: {
        ...block.config,
        ...(block.config?.peer && {
          peer: visit({ kind: "answer", id: block.config.peer, path: ["config", "peer"] }),
        }),
      },
    }),
    import: (block, context) =>
      context.importQuestion(block, "reference-code").map((node) => {
        return "kind" in node && node.kind === "reference-code"
          ? {
              ...node,
              $: {
                ...node.$,
                settings: { ...jsonSettings(node.$?.settings ?? {}), ...block.config },
              },
            }
          : node;
      }),
    export: (context) => {
      const block = context.exportQuestion("reference-code");
      const raw = context.nodes.find((node) => "kind" in node && node.kind === "reference-code");
      const { default: defaultValue, ...rest } = block;

      if (
        defaultValue !== undefined &&
        defaultValue !== null &&
        typeof defaultValue === "object" &&
        !Array.isArray(defaultValue)
      )
        throw Error("Reference code does not support date defaults");
      const config = configOf(block.config);
      const settings = jsonSettings(raw?.$?.settings ?? {});

      if (settings.code !== undefined) config.code = settingText(settings.code);

      const result: import("../../src/forms").NativeQuestion<"reference-code", ReferenceConfig> = {
        ...rest,
        kind: "reference-code",
        config,
      };

      if (defaultValue !== undefined) result.default = defaultValue;

      return result;
    },
  }),
  kind: "reference-code",
  label: "Reference code",
  untitled: "Untitled reference code",
  gutterOffset: 11,
  icon: createElement("span", { "aria-hidden": true }, "#"),
  source: {
    storage: { type: "input", property: "kind", value: "reference-code" },
    attributes: { code: "string" },
  },
  settings: { read, defaults: { code: "REF" } },
  capabilities: {
    hideLabel: true,
    repeat: true,
    comparisons: ["IS", "IS_NOT", "IS_EMPTY", "IS_NOT_EMPTY"],
    formula: true,
    mention: true,
  },
  references: (settings, visit) => ({
    peer:
      settings.peer === undefined
        ? undefined
        : visit({ kind: "field", value: settings.peer, path: ["peer"] }),
  }),
  validate: (settings, raw, where) =>
    raw.code !== undefined &&
    (typeof raw.code !== "string" || !/^[A-Z]{3}$/.test(settings.code ?? ""))
      ? [
          {
            code: "reference-code",
            message: "Use three uppercase letters for the reference code",
            where,
          },
        ]
      : [],
  draw: (settings) => {
    const box = document.createElement("div");
    box.dataset.referenceCode = "";
    box.textContent = `${settings.code ?? "REF"} — Reference code`;

    return box;
  },
  redraw: (before, after) => before.code !== after.code,
});

function Controls({ m, a }: { m: BlockMenuModel; a: BlockMenuActions }) {
  return createElement(
    "label",
    null,
    "Reference prefix",
    createElement("input", {
      "aria-label": "Reference prefix",
      value: String(m.settings.code ?? "REF"),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        a.onSettings({ code: event.target.value }),
    }),
  );
}

export const ReferenceFieldModule = () =>
  fieldModule({
    field: referenceField,
    Controls,
    Preview: () => createElement("div", null, "REF — Reference code"),
    insertion: {
      id: "REFERENCE_CODE",
      order: 99,
      create: () => [$createDrawnInput("reference-code", { code: "REF" })],
      question: {
        description: "A reference linked to another answer.",
        label: "Application reference",
      },
      answer: { description: "A reference code answer input." },
    },
  });
