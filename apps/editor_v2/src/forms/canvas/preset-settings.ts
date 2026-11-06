import { $installedField } from "./field-context";
import type { Settings } from "../model/settings";
import { formatOf } from "../model/formats";
import type { FieldWidth } from "../model/field-settings";
import { presetProvenance } from "../model/provenance";

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

import { legacyFieldAdapter } from "../formats/legacy-ssb/legacy-mappings";
