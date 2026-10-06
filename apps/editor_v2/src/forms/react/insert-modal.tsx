import type { NodeKey } from "lexical";
import { InsertModal as ActionInsertModal } from "../../editor/react/insert-modal";

/** Adapts the form gutter's insertion/follow-up targets. */
export function InsertModal({
  line,
  followUpFor = null,
  onClose,
}: {
  line: NodeKey | null;
  followUpFor?: NodeKey | null;
  onClose: () => void;
}) {
  return (
    <ActionInsertModal
      request={
        line === null
          ? null
          : { targetKey: followUpFor ?? line, mode: followUpFor ? "follow-up" : "insert" }
      }
      onClose={onClose}
      searchPlaceholder="Find questions, Form registry and layout blocks"
    />
  );
}
