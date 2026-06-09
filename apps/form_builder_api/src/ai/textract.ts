import type { Block } from "@aws-sdk/client-textract";

// blocksToText walks Textract's block graph and emits a compact text
// representation Claude can read. It preserves page boundaries, key/value
// labels, checkbox state, and ordering — enough structure for the form-builder
// recipe model to reconstruct the form. The output format is internal only;
// nothing parses it downstream.
export function blocksToText(blocks: Block[]): string {
  if (!blocks.length) return "";
  const byId = new Map<string, Block>();
  for (const b of blocks) {
    if (b.Id) byId.set(b.Id, b);
  }
  const pages = blocks.filter((b) => b.BlockType === "PAGE");
  const out: string[] = [];

  for (const page of pages) {
    out.push(`## Page ${page.Page ?? "?"}`);
    out.push("");

    const childIds =
      page.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
    const consumedLineIds = new Set<string>();

    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;

      if (child.BlockType === "LINE" && child.Text) {
        if (consumedLineIds.has(childId)) continue;
        out.push(child.Text);
      } else if (
        child.BlockType === "KEY_VALUE_SET" &&
        child.EntityTypes?.includes("KEY")
      ) {
        const label = collectWords(child, byId);
        out.push(`${label} ${"_".repeat(30)}`);
      } else if (child.BlockType === "SELECTION_ELEMENT") {
        const mark = child.SelectionStatus === "SELECTED" ? "[x]" : "[ ]";
        const labelId = labelForSelection(childId, childIds, byId);
        if (labelId) consumedLineIds.add(labelId);
        const label = labelId ? (byId.get(labelId)?.Text ?? "") : "";
        out.push(`${mark} ${label}`);
      }
    }
    out.push("");
  }

  return out.join("\n").trim();
}

function collectWords(parent: Block, byId: Map<string, Block>): string {
  const childIds =
    parent.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
  return childIds
    .map((id) => byId.get(id)?.Text ?? "")
    .filter(Boolean)
    .join(" ");
}

// labelForSelection pairs the N-th SELECTION_ELEMENT in a sibling group with
// the N-th LINE that follows the last selection in that group. This works for
// the layouts our hand-crafted fixtures use AND for the layouts we've seen in
// real Textract output during early testing. If real-world output ever
// interleaves selections with their labels (e.g. [sel, line, sel, line] for
// vertically stacked checkboxes), this would mis-pair — smoke-testing against
// real PDFs in Phase 4 of the plan will surface that case if it exists. The
// alternative (track a contiguous selection run and pair from the end of it)
// is more code for a case we haven't yet observed; YAGNI until we have.
function labelForSelection(
  selId: string,
  siblingIds: string[],
  byId: Map<string, Block>,
): string | undefined {
  let rank = 0;
  let groupEnd = -1;
  for (let i = 0; i < siblingIds.length; i++) {
    const sib = byId.get(siblingIds[i]);
    if (sib?.BlockType === "SELECTION_ELEMENT") {
      if (siblingIds[i] === selId)
        rank = countSelectionsBefore(i, siblingIds, byId);
      groupEnd = i;
    }
  }
  if (groupEnd < 0) return undefined;

  let seen = 0;
  for (let i = groupEnd + 1; i < siblingIds.length; i++) {
    const next = byId.get(siblingIds[i]);
    if (next?.BlockType === "LINE" && next.Text) {
      if (seen === rank) return siblingIds[i];
      seen++;
    }
  }
  return undefined;
}

function countSelectionsBefore(
  index: number,
  siblingIds: string[],
  byId: Map<string, Block>,
): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (byId.get(siblingIds[i])?.BlockType === "SELECTION_ELEMENT") count++;
  }
  return count;
}
