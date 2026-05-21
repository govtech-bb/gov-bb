import { CHAT_FORM_SCHEMA_LOADERS } from "./schema-registry";

// V1: form registry is deferred. With an empty CHAT_FORM_SCHEMA_LOADERS,
// no source URL maps to a form slug, so the API will not enable the
// open_form_review tool.
const CHAT_FORM_ENTRIES: Array<[string, string]> = Object.keys(
  CHAT_FORM_SCHEMA_LOADERS,
).map((storage) => [storage, storage]);

export function knownFormSlugsInSources(
  urls: Array<string | undefined>,
): string[] {
  const hits = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    for (const [pageSlug, storageSlug] of CHAT_FORM_ENTRIES) {
      if (url.includes(`/${pageSlug}`)) hits.add(storageSlug);
    }
  }
  return [...hits];
}
