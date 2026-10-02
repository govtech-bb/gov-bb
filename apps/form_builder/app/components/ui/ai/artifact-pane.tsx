import { useId, useState } from "react";
import { Cancel01Icon } from "hugeicons-react";
import type { ServiceSnapshot } from "@govtech-bb/form-types";
import { ServicePreviewBody } from "../../services/service-preview";
import { Button } from "../button";
import { Empty } from "../empty";
import { Loader } from "../loader";
import { ScrollArea } from "../scroll-area";
import { Tabs } from "../tabs";
import { ChangeDiff, type PreparedChange } from "./review";

export function ArtifactPane({
  artifact,
  change,
  validating,
  revision,
  proposalId,
  onClose,
  requestedTab,
}: {
  artifact?: { snapshot: ServiceSnapshot; pageId?: string; stepId?: string };
  change?: Omit<PreparedChange, "apply">;
  validating: boolean;
  revision: string;
  proposalId?: string;
  onClose?: () => void;
  requestedTab?: { id: number; value: "preview" | "changes" };
}) {
  const id = useId();
  const proposal = proposalId ?? change;
  const defaultTab = validating || change ? "changes" : "preview";
  const [selection, setSelection] = useState<{
    proposal: typeof proposal;
    requestId?: number;
    value: string;
  }>({
    proposal,
    requestId: requestedTab?.id,
    value: requestedTab?.value ?? defaultTab,
  });
  const newRequest = requestedTab && selection.requestId !== requestedTab.id;
  if (selection.proposal !== proposal || newRequest) {
    setSelection({
      proposal,
      requestId: requestedTab?.id,
      value: newRequest ? requestedTab.value : defaultTab,
    });
  }
  const tab = selection.value;
  return (
    <aside
      aria-label="Preview and changes"
      className="flex min-h-0 w-[min(400px,40cqi)] shrink-0 flex-col overflow-hidden rounded-xl border border-ui-hairline bg-ui-base"
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-ui-hairline px-3">
        <Tabs
          variant="underline"
          size="sm"
          listClassName="gap-3 border-b-0 pb-0"
          aria-label="Preview and changes"
          value={tab}
          onValueChange={(value) => setSelection({ ...selection, value })}
          tabs={[
            {
              id: `${id}-preview`,
              value: "preview",
              label: "Preview",
              "aria-controls": `${id}-panel`,
            },
            {
              id: `${id}-changes`,
              value: "changes",
              label: "Changes",
              "aria-controls": `${id}-panel`,
            },
          ]}
        />
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Close preview and changes"
            onClick={onClose}
          >
            <Cancel01Icon size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col p-3"
      >
        {tab === "changes" ? (
          validating ? (
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
          )
        ) : artifact ? (
          <ServicePreviewBody
            key={revision}
            snapshot={artifact.snapshot}
            initialPageId={artifact.pageId}
            initialStepId={artifact.stepId}
            compact
          />
        ) : (
          <Empty size="sm" title="No preview available" />
        )}
      </div>
    </aside>
  );
}
