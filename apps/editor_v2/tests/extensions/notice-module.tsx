import { jsonSettings } from "../helpers/serialized-test-data";
import { $create, $createTextNode, ElementNode, type RangeSelection } from "lexical";
import {
  $depth,
  $paragraphAfter,
  $setDepth,
  $settings,
  $setSettings,
  contentActions,
  type ContentEntry,
  type EditorModule,
} from "../../src/editor";

export class NoticeNode extends ElementNode {
  override $config() {
    return this.config("example-notice", { extends: ElementNode });
  }
  override createDOM() {
    const element = document.createElement("aside");
    element.dataset.notice = "";
    element.dataset.tone = String($settings(this).tone ?? "information");

    return element;
  }
  override updateDOM(previous: this, element: HTMLElement) {
    element.dataset.tone = String($settings(this).tone ?? "information");

    return false;
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $setDepth($paragraphAfter(this, restoreSelection), $depth(this));
  }
}

export const $createNotice = (text = "Notice", tone: "information" | "warning" = "information") =>
  $setSettings($create(NoticeNode).append($createTextNode(text)), { tone });

export const noticeEntry: ContentEntry = {
  id: "example-notice",
  kind: "example-notice",
  title: "Notice",
  icon: <span aria-hidden="true">!</span>,
  description: "A note with an editable information or warning tone.",
  sample: { label: "Notice" },
  create: () => [$createNotice()],
  renderPreview: () => <aside>Notice</aside>,
};

export const NoticeModule = ({ actions = true } = {}): EditorModule => ({
  key: "example:notice",
  nodes: [
    {
      type: "example-notice",
      node: NoticeNode,
      validate: (node) => {
        const state = jsonSettings(node.$ ?? {});
        const tone = jsonSettings(state.settings ?? {}).tone;

        return tone === undefined || tone === "information" || tone === "warning"
          ? undefined
          : "Notice tone must be information or warning";
      },
    },
  ],
  actions: actions ? contentActions([noticeEntry]) : [],
});
