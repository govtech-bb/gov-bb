/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { $nodesOfType, $setSelection, UNDO_COMMAND, type LexicalEditor } from "lexical";
import {
  $createTableSelectionFrom,
  $isTableCellNode,
  $isTableRowNode,
  TableNode,
} from "@lexical/table";
import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { PageComponentNode } from "../../src/pages/nodes";
import { hoverPageMenu, pageControl, renderPageEditor } from "../helpers/page-editor";

async function selectColumns(editor: LexicalEditor, from: number, to: number) {
  await act(async () =>
    editor.update(
      () => {
        const table = $nodesOfType(TableNode)[0];
        const head = table?.getFirstChild();
        const body = table?.getLastChild();
        const anchor = $isTableRowNode(head) ? head.getChildAtIndex(from) : null;
        const focus = $isTableRowNode(body) ? body.getChildAtIndex(to) : null;

        if (!table || !$isTableCellNode(anchor) || !$isTableCellNode(focus))
          throw new Error("Expected table selection cells");
        $setSelection($createTableSelectionFrom(table, anchor, focus));
      },
      { discrete: true },
    ),
  );
  await hoverPageMenu(
    pageControl<HTMLElement>(`.page-editable tr:last-child > :nth-child(${to + 1})`),
  );
}

async function choose(action: string) {
  const button = [
    ...pageControl(".page-block-menu").querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((candidate) => candidate.textContent === action);

  if (!button) throw new Error(`Missing table operation: ${action}`);
  await act(async () => button.click());
}

test.each([false, true])(
  "deletes the selected column, not the first, with captioned=%s",
  async (captioned) => {
    const table = "| Service | Cost |\n| --- | --- |\n| Copy | 50 |";
    const source = captioned ? `:::table[Fees]\n${table}\n:::` : table;
    const editor = await renderPageEditor(source);
    await selectColumns(editor, 1, 1);
    await choose("Delete column");
    expect(
      [...document.querySelectorAll(".page-editable th, .page-editable td")].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["Service", "Copy"]);
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
  },
);

test.each([
  { action: "Delete column", from: 1, to: 1, headers: ["Service", "Cost"], numeric: [1] },
  { action: "Delete column", from: 0, to: 0, headers: ["Tax", "Cost"], numeric: [0, 1] },
  { action: "Delete column", from: 2, to: 1, headers: ["Service"], numeric: [] },
  {
    action: "Add column",
    from: 0,
    to: 0,
    headers: ["Service", "", "Tax", "Cost"],
    numeric: [2, 3],
  },
  {
    action: "Add column",
    from: 1,
    to: 1,
    headers: ["Service", "Tax", "", "Cost"],
    numeric: [1, 3],
  },
])(
  "$action from $from to $to keeps numeric columns attached to their data",
  async ({ action, from, to, headers, numeric }) => {
    const source =
      ':::table[Fees]{numeric-columns="2,3"}\n| Service | Tax | Cost |\n| --- | --- | --- |\n| Copy | 5 | 50 |\n:::';

    const editor = await renderPageEditor(source);
    await selectColumns(editor, from, to);
    await choose(action);
    expect(
      [...document.querySelectorAll(".page-editable tr:first-child > *")].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(headers);
    expect(
      editor
        .getEditorState()
        .read(() => $nodesOfType(PageComponentNode)[0]?.getAttributes().numericColumns),
    ).toEqual(numeric);
    const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(parseContentMarkdown(encoded).errors).toEqual([]);
    expect(govbbPageCodec.prepare(encoded).mode).toBe("visual");
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
  },
);
