import { cn } from "../../cn";
import { useLayout } from "./chrome";
import {
  $blockKind,
  $formBlocks,
  $isFoldedAway,
  $isHost,
  $isShowHideNode,
  $nested,
} from "../editor/nodes";
import { REVEAL_RAIL, SECTION_RAIL } from "../editor/nesting";

/** One unbroken GovBB rail per option's follow-ups or show/hide's content. */
export function NestRails({ anchor }: { anchor: HTMLElement }) {
  const editor = useLayout(anchor);
  const box = anchor.getBoundingClientRect();

  const rails = editor.getEditorState().read(
    () =>
      $formBlocks().flatMap((host) => {
        if (!$isHost(host) || $isFoldedAway(host)) return [];
        const dom = editor.getElementByKey(host.getKey());

        const nested = $nested(host).flatMap((block) => {
          const el = editor.getElementByKey(block.getKey());

          return el?.getClientRects().length ? [el] : [];
        });

        if (!dom || !nested.length) return [];
        const first = nested[0]!.getBoundingClientRect();
        const last = nested.at(-1)!;

        const bottom =
          last.getBoundingClientRect().bottom +
          (parseFloat(getComputedStyle(last).marginBottom) || 0);

        const section = $isShowHideNode(host);
        const rail = section ? SECTION_RAIL : REVEAL_RAIL;

        return [
          {
            key: host.getKey(),
            neutral: section || $blockKind(host) === "dropdown",
            left: dom.getBoundingClientRect().left - box.left + rail.left,
            top: first.top - box.top,
            height: bottom - first.top,
            width: rail.width,
          },
        ];
      }),
    { editor },
  );

  return rails.map(({ key, neutral, ...style }) => (
    <div
      key={key}
      aria-hidden="true"
      className={cn("pointer-events-none absolute", neutral ? "bg-line" : "bg-highlight")}
      style={style}
    />
  ));
}
