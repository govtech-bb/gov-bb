/** A line of a comparison: in both versions, or only in the earlier or the later one. */
export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/**
 * The lines of `before` and `after` in order, each marked as kept, removed or added, by their longest common
 * subsequence, a removed line before the line that replaces it. Quadratic in the line count, which a page's body keeps small.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // common[i][j]: the longest run a[i..] and b[j..] share

  const common = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i]![j] =
        a[i] === b[j]
          ? common[i + 1]![j + 1]! + 1
          : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i++]! });
      j++;
    } else if (i < a.length && (j === b.length || common[i + 1]![j]! >= common[i]![j + 1]!))
      lines.push({ kind: "removed", text: a[i++]! });
    else lines.push({ kind: "added", text: b[j++]! });
  }

  return lines;
}
