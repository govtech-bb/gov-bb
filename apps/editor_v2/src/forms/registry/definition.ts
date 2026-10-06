import type { ReactNode } from "react";
import { immutableData } from "../../editor/core/immutable";
import type { AnyFormBlock, AnyFormDefinition } from "../schema";

type RegistryMetadata = {
  readonly key: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly keywords?: string;
  readonly icon?: ReactNode;
  readonly trailingParagraph?: boolean;
  /** Initial editor presentation only; these local question IDs are not form schema data. */
  readonly foldedQuestions?: readonly string[];
  /** Explicit factory bindings to identities already owned by the destination form. */
  readonly externalReferences?: readonly string[];
};

export type FormRegistryFragment = RegistryMetadata & {
  readonly scope: "fragment" | "page";
  readonly blocks: readonly AnyFormBlock[];
};

export type FormRegistryForm = RegistryMetadata & {
  readonly scope: "form";
  readonly form: AnyFormDefinition;
};

export type FormRegistryEntry = FormRegistryFragment | FormRegistryForm;

export type FormRegistry = { readonly entries: readonly FormRegistryEntry[] };

/** Catalog metadata stays outside each independently editable native definition. */
export function defineFormRegistryEntry<T extends FormRegistryEntry>(entry: T): T {
  if (!entry.key.trim() || !entry.title.trim())
    throw new Error("A Form registry entry needs a key and title");

  if (!Number.isInteger(entry.version) || entry.version < 1)
    throw new Error(`Invalid Form registry version: ${entry.key}`);
  const blocks = entry.scope === "form" ? entry.form.blocks : entry.blocks;

  if (!blocks.length) throw new Error(`Empty Form registry entry: ${entry.key}`);

  if (entry.scope === "page" && blocks[0]?.type !== "page")
    throw new Error(`Registry ${entry.key}: a page entry must begin with a page`);

  if (entry.scope === "fragment" && blocks.some((block) => block.type === "page"))
    throw new Error(`Registry ${entry.key}: a fragment cannot contain pages`);

  const copy = { ...entry };

  if (copy.externalReferences)
    Object.assign(copy, { externalReferences: immutableData([...copy.externalReferences]) });

  if (copy.foldedQuestions)
    Object.assign(copy, { foldedQuestions: immutableData([...copy.foldedQuestions]) });

  if (copy.scope === "form") Object.assign(copy, { form: immutableData(copy.form) });
  else Object.assign(copy, { blocks: immutableData([...copy.blocks]) });

  return Object.freeze(copy);
}

export function defineFormRegistry(entries: readonly FormRegistryEntry[]): FormRegistry {
  if (new Set(entries.map((entry) => entry.key)).size !== entries.length)
    throw new Error("Duplicate Form registry entry key");

  return Object.freeze({ entries: Object.freeze(entries.map(defineFormRegistryEntry)) });
}
