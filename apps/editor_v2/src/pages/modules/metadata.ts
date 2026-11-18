import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  mergeRegister,
  RootNode,
  type LexicalNode,
  type ParagraphNode,
} from "lexical";
import type { PageModule } from "../definition";
import { PageMetadataNode } from "../metadata";

export function PageMetadataModule(): PageModule {
  return {
    key: "page-metadata",
    nodes: [{ type: "page-metadata", node: PageMetadataNode }],
    $initialize: () => {
      $getRoot().append(new PageMetadataNode(), $createParagraphNode());
    },
    registrations: [
      {
        key: "page-metadata-preservation",
        phase: "document",
        register: (editor) =>
          mergeRegister(
            editor.registerNodeTransform(PageMetadataNode, (metadata) => {
              // Select-all replacement can put the caret in the first root element, including hidden metadata.
              let after: LexicalNode = metadata;
              let paragraph: ParagraphNode | undefined;

              for (const child of metadata.getChildren()) {
                if ($isElementNode(child) && !child.isInline()) {
                  after.insertAfter(child);
                  after = child;
                  paragraph = undefined;
                } else {
                  if (!paragraph) {
                    paragraph = $createParagraphNode();
                    after.insertAfter(paragraph);
                    after = paragraph;
                  }

                  paragraph.append(child);
                }
              }
            }),
            editor.registerNodeTransform(RootNode, (root) => {
              if (root.getChildren().some((node) => node instanceof PageMetadataNode)) return;

              const previous = editor.getEditorState().read(() => {
                const node = $getRoot()
                  .getChildren()
                  .find((child) => child instanceof PageMetadataNode);

                return node instanceof PageMetadataNode ? node.exportJSON() : null;
              });

              const metadata = previous
                ? PageMetadataNode.importJSON(previous)
                : new PageMetadataNode();

              root.splice(0, 0, [metadata]);

              if (root.getChildrenSize() === 1) root.append($createParagraphNode());
            }),
          ),
      },
    ],
  };
}
