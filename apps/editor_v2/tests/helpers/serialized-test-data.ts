import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import type { Setting, Settings } from "../../src/editor/core/settings";

/** Serialized fixture projections retain the optional fields installed by the test editor. */
export type TestSerializedNode = SerializedLexicalNode & {
  text?: string;
  kind?: string;
  widget?: string;
  tag?: string;
  children?: TestSerializedNode[];
  $?: { id?: string; depth?: number; settings?: Settings; [key: string]: Setting | undefined };
};

export function serializedNodes(state: SerializedEditorState): TestSerializedNode[] {
  if (!state.root.children.every(isSerializedTestNode))
    throw Error("Invalid serialized fixture node");

  return state.root.children;
}

/** Parse fixture values before passing them through the editor's JSON settings boundary. */
export function jsonSetting(value: unknown): Setting {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (Array.isArray(value)) return value.map(jsonSetting);

  if (value && typeof value === "object") {
    const result: Settings = {};

    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) result[key] = jsonSetting(child);
    }

    return result;
  }

  throw Error("Fixture must contain JSON settings");
}

export function jsonSettings(value: unknown): Settings {
  const parsed = jsonSetting(value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("Fixture must contain a settings object");

  return parsed;
}

function isSetting(value: unknown): value is Setting {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;

  if (typeof value === "number") return Number.isFinite(value);

  if (Array.isArray(value)) return value.every(isSetting);

  return !!value && typeof value === "object" && Object.values(value).every(isSetting);
}

function isSerializedTestNode(value: unknown): value is TestSerializedNode {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    typeof value.type !== "string" ||
    !("version" in value) ||
    typeof value.version !== "number"
  )
    return false;

  if ("text" in value && typeof value.text !== "string") return false;

  if ("kind" in value && typeof value.kind !== "string") return false;

  if ("widget" in value && typeof value.widget !== "string") return false;

  if ("tag" in value && typeof value.tag !== "string") return false;

  if (
    "children" in value &&
    (!Array.isArray(value.children) || !value.children.every(isSerializedTestNode))
  )
    return false;

  if ("$" in value) {
    const state = value.$;

    if (!state || typeof state !== "object" || Array.isArray(state)) return false;

    if ("id" in state && typeof state.id !== "string") return false;

    if ("depth" in state && typeof state.depth !== "number") return false;

    if (
      "settings" in state &&
      (!state.settings || typeof state.settings !== "object" || Array.isArray(state.settings))
    )
      return false;

    if (!Object.values(state).every(isSetting)) return false;
  }

  return true;
}

export function settingsObject(value: Setting | undefined): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected settings object");

  return value;
}

export function settingsArray(value: Setting | undefined): Setting[] {
  if (!Array.isArray(value)) throw Error("Expected settings array");

  return value;
}

export function settingText(value: Setting | undefined): string {
  if (typeof value !== "string") throw Error("Expected a string setting");

  return value;
}
