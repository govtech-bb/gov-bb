export const KEBAB_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const RESERVED_PAGE_IDS = new Set([
  "check-your-answers",
  "declaration",
  "submission-confirmation",
  "config",
]);

export type Resolved = { id: string; pinned: boolean; fixed?: true; clash?: string };

export type IdItem = { key: string; pinned?: string; auto: string; fixed?: string };

export function slug(text: string) {
  const value = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (value.length <= 48) return value;
  const end = value.lastIndexOf("-", 48);

  return value.slice(0, Math.max(0, end));
}

export function autoId(text: string, fallback: string, prefix: string) {
  const value = slug(text) || fallback;

  return /^[0-9]/.test(value) ? prefix + value : value;
}

/** Fixed IDs claim first, then pins, so changing a title can never take an authored ID away. */
export function resolveIds(
  items: IdItem[],
  reserved = new Set<string>(),
  valid = (id: string) => KEBAB_ID_PATTERN.test(id),
) {
  const taken = new Set(reserved);
  const resolved = new Map<string, Resolved>();

  for (const { key, fixed } of items) {
    if (!fixed) continue;
    taken.add(fixed);
    resolved.set(key, { id: fixed, pinned: false, fixed: true });
  }

  for (const { key, pinned } of items) {
    if (resolved.has(key) || pinned === undefined || !valid(pinned) || taken.has(pinned)) continue;
    taken.add(pinned);
    resolved.set(key, { id: pinned, pinned: true });
  }

  for (const { key, pinned, auto } of items) {
    if (resolved.has(key)) continue;
    const base = pinned ?? auto;
    let id = base;

    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    resolved.set(key, {
      id,
      pinned: pinned !== undefined,
      ...(pinned !== undefined && id !== pinned && { clash: pinned }),
    });
  }

  return new Map(items.map(({ key }) => [key, resolved.get(key)!]));
}

export function checkId(
  id: string,
  taken: Set<string>,
  reserved = new Set<string>(),
  subject: "question" | "page" | "block" = "question",
) {
  if (!KEBAB_ID_PATTERN.test(id))
    return "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)";

  if (reserved.has(id)) return `This ID is kept for SSB's ‘${id}’ page`;

  if (taken.has(id)) return `Another ${subject} already uses this ID`;

  return null;
}
