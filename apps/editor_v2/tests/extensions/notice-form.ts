import { jsonSettings, settingText } from "../helpers/serialized-test-data";
import { defineContent, defineNativeContent, formContentModule } from "../../src/forms";
import { NoticeModule, noticeEntry } from "./notice-module";

type NoticeConfig = { tone: "information" | "warning"; peer?: string; literal?: string };

const configOf = (value: unknown): NoticeConfig => {
  const raw = jsonSettings(value ?? {}),
    tone = raw.tone ?? "information";

  if (tone !== "information" && tone !== "warning") throw Error("Invalid notice tone");
  const result: NoticeConfig = { tone };

  if (raw.peer !== undefined) result.peer = settingText(raw.peer);

  if (raw.literal !== undefined) result.literal = settingText(raw.literal);

  return result;
};

export const noticeContent = defineContent({
  native: defineNativeContent<
    "example-notice",
    { tone: "information" | "warning"; peer?: string; literal?: string }
  >({
    kind: "example-notice",
    validate: (block, path) =>
      block.config?.tone && !["information", "warning"].includes(block.config.tone)
        ? [
            {
              code: "notice-tone",
              severity: "error",
              path: [...path, "config", "tone"],
              message: "Notice tone must be information or warning",
            },
          ]
        : [],
    references: (block, visit) => ({
      ...block,
      config: {
        tone: "information",
        ...block.config,
        ...(block.config?.peer && {
          peer: visit({ kind: "answer", id: block.config.peer, path: ["config", "peer"] }),
        }),
      },
    }),
    import: (block, context) =>
      context.importContent(block, "example-notice").map((node) => ({
        ...node,
        $: { ...node.$, settings: { ...block.config } },
      })),
    export: (context) => {
      const block = context.exportContent("example-notice");

      if (block.type !== "content") throw Error("Expected content");

      const settings = jsonSettings(context.nodes[0]?.$?.settings ?? {});
      const config = configOf(block.config);

      if (settings.tone !== undefined) {
        if (settings.tone !== "information" && settings.tone !== "warning")
          throw Error("Invalid notice tone");
        config.tone = settings.tone;
      }

      return { ...block, kind: "example-notice", config };
    },
  }),
  kind: "example-notice",
  label: "Notice",
  source: { storage: { type: "example-notice" }, syntax: { type: "directive", name: "notice" } },
  references: (settings, visit) => {
    const next = { ...settings };

    if (typeof settings.peer === "string")
      next.peer = visit({ kind: "field", value: settings.peer, path: ["peer"] });

    return next;
  },
  fieldId: () => "notice",
});

export const NoticeFormModule = () =>
  formContentModule(NoticeModule({ actions: false }), [noticeContent], [noticeEntry], 4000);
