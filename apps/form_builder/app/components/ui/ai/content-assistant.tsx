import { aiContentPatchSchema } from "@govtech-bb/form-builder";
import {
  applyAiPagePatch,
  isValidSlug,
  type FormState,
} from "../../../routes/content/-lib";
import type { AssistantRequest } from "./prompt-bar";
import { Assistant } from "./assistant";

export function ContentAssistant({
  user,
  documentId,
  state,
  fixedPath,
  readOnly,
  open,
  onOpenChange,
  onApply,
  request,
  onRequestHandled,
}: {
  request?: AssistantRequest;
  onRequestHandled?: () => void;
  user: string;
  documentId: string;
  state: FormState;
  fixedPath: boolean;
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (state: FormState) => void;
}) {
  return (
    <Assistant
      key={documentId}
      request={request}
      onRequestHandled={onRequestHandled}
      user={user}
      kind="content"
      documentId={documentId}
      document={{ ...state }}
      revisionSource={state}
      readOnly={readOnly}
      open={open}
      onOpenChange={onOpenChange}
      prepare={async (proposal) => {
        const patch = aiContentPatchSchema.parse(proposal.patch);
        if (patch.slug !== undefined && !fixedPath && !isValidSlug(patch.slug))
          throw new Error(
            "The proposed URL slug is invalid. Ask the assistant to correct it.",
          );
        if (
          patch.linkHref &&
          patch.linkType !== "none" &&
          !/^(https?:\/\/|\/)[^\s]+$/i.test(patch.linkHref)
        )
          throw new Error(
            "The proposed start link must be an internal path or an HTTP(S) URL.",
          );
        const next = applyAiPagePatch(state, patch, { fixedPath });
        const warnings = [];
        if (!next.title.trim())
          warnings.push("Add a page title before deploying.");
        if (!next.category)
          warnings.push("Choose a category before deploying.");
        if (!next.body.trim())
          warnings.push("Add page content before deploying.");
        return {
          before: { ...state },
          after: { ...next },
          warnings,
          apply: () => onApply(next),
        };
      }}
    />
  );
}
