import { $installedField } from "./field-context";
import type { Settings } from "../core/settings";
import { formatOf } from "../core/formats";
import type { FieldWidth } from "../core/field-settings";
import { presetProvenance } from "../core/provenance";

export const formatMessage = (pattern: string, subject: string) =>
  formatOf({ pattern })?.message(subject);

export function presetOf(settings: Settings, kind: string) {
  const component = presetProvenance(settings);

  return component?.kind === kind ? component : undefined;
}

export const refOf = (kind: string, settings: Settings): string =>
  presetOf(settings, kind)?.ref ?? legacyFieldAdapter($installedField(kind))?.ref ?? "";

export function fieldWidthOf(kind: string, settings: Settings): FieldWidth | undefined {
  const field = $installedField(kind);
  const fallback = field?.capabilities.width;

  const width = settings.width;

  return (
    fallback && (width === "short" || width === "medium" || width === "long" ? width : fallback)
  );
}

import { legacyFieldAdapter } from "./legacy-mappings";
