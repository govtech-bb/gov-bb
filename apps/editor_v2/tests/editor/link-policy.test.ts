import { expect, test, vi } from "vitest";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type ParagraphNode,
} from "lexical";
import { registerLinkPolicy } from "../../src/editor/modules/links/module";
import { isSupportedLinkUrl } from "../../src/editor/modules/links/url";

test("a pasted link the page can't keep gives way to its text, and the writer is told once", () => {
  const editor = createEditor({
    nodes: [LinkNode],
    onError: (error) => {
      throw error;
    },
  });

  const notify = vi.fn();

  const dispose = registerLinkPolicy(editor, isSupportedLinkUrl, notify);

  editor.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append(
          $createLinkNode("javascript:void(0)").append($createTextNode("Apply")),
          $createTextNode(" or "),
          $createLinkNode("file:///C:/forms/apply.docx").append($createTextNode("download")),
          $createTextNode(" at "),
          $createLinkNode("https://www.gov.bb").append($createTextNode("GOV.BB")),
          $createTextNode(", "),
          $createLinkNode("mailto:info@health.gov.bb").append($createTextNode("email")),
        ),
      );
    },
    { discrete: true },
  );

  editor.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChildOrThrow<ParagraphNode>();

    expect(paragraph.getTextContent()).toBe("Apply or download at GOV.BB, email");
    expect(
      paragraph
        .getChildren()
        .filter($isLinkNode)
        .map((link) => link.getURL()),
    ).toEqual(["https://www.gov.bb", "mailto:info@health.gov.bb"]);
  });

  expect(notify).toHaveBeenCalledTimes(1);

  // Links the page can keep pass without a word
  editor.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append(
          $createLinkNode("/guidance").append($createTextNode("Guidance")),
        ),
      );
    },
    { discrete: true },
  );

  expect(notify).toHaveBeenCalledTimes(1);
  dispose();
});
