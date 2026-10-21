import { Cancel01Icon } from "hugeicons-react";
import { Button } from "../button";
import { Empty } from "../empty";
import { Loader } from "../loader";
import { ScrollArea } from "../scroll-area";
import { ChangeDiff, type PreparedChange } from "./review";

export function ArtifactPane({
  change,
  validating,
  onClose,
}: {
  change?: Omit<PreparedChange, "apply">;
  validating: boolean;
  onClose?: () => void;
}) {
  return (
    <aside
      aria-label="Changes"
      className="flex min-h-0 w-[min(400px,40cqi)] shrink-0 flex-col overflow-hidden rounded-xl border border-ui-hairline bg-ui-base"
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-ui-hairline px-3">
        <h2 className="text-sm font-medium text-ui-strong">Changes</h2>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Close changes"
            onClick={onClose}
          >
            <Cancel01Icon size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {validating ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-[12px] leading-5 text-ui-subtle">
            <span aria-hidden="true">
              <Loader size={16} />
            </span>
            <p>Changes will appear here after the draft check.</p>
          </div>
        ) : change ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3">
              <ChangeDiff change={change} />
            </div>
          </ScrollArea>
        ) : (
          <Empty size="sm" title="No proposed changes" />
        )}
      </div>
    </aside>
  );
}
