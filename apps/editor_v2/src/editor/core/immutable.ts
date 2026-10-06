/** Detach JSON-like declaration metadata; never freeze externally owned runtime objects. */
export function immutableData<T>(value: T): T {
  const copy = structuredClone(value);

  const freeze = (item: unknown) => {
    if (!item || typeof item !== "object") return;

    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };

  freeze(copy);

  return copy;
}
