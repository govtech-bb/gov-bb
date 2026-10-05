import frozen from "./legacy-provenance-v1.json";
import type { Settings } from "./settings";
import { immutableData } from "../../editor/core/immutable";

export type SavedPreset = { kind: string; label: string; ref: string };

type LegacyProvenance = {
  kind: string;
  name: string;
  fieldId: string;
  label: string;
  optionValues?: Record<string, string>;
};

type PresetProvenance = Omit<LegacyProvenance, "fieldId"> & { ref: string; fieldId?: string };

const legacy: Readonly<Record<string, LegacyProvenance>> = immutableData(frozen);

/** Old snapshots use a frozen import record; new declarations can save their own provenance. */
export function presetProvenance(settings: Settings): PresetProvenance | undefined {
  const saved = settings.sourcePreset;

  if (
    saved &&
    typeof saved === "object" &&
    !Array.isArray(saved) &&
    typeof saved.kind === "string" &&
    typeof saved.label === "string" &&
    typeof saved.ref === "string"
  ) {
    return {
      kind: saved.kind,
      name: saved.label,
      ref: saved.ref,
      label: typeof settings.sourceLabel === "string" ? settings.sourceLabel : saved.label,
      fieldId: typeof settings.sourceFieldId === "string" ? settings.sourceFieldId : undefined,
    };
  }

  const ref = settings.ref;

  if (typeof ref !== "string") return undefined;
  const previous = Object.hasOwn(legacy, ref) ? legacy[ref] : undefined;

  return previous ? { ...previous, ref } : undefined;
}
