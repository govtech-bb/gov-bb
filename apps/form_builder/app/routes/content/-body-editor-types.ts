import type { AssistantRequest } from "../../components/ui/ai/prompt-bar";
import type { StartLinkType } from "./-lib";

export type BodyEditorProfile =
  | {
      kind: "landing-page";
      startLinkType: StartLinkType;
    }
  | {
      kind: "form-content";
    };

export interface BodyEditorProps {
  id: string;
  ariaLabel: string;
  value: string;
  onChange: (next: string) => void;
  profile: BodyEditorProfile;
  onAiAction?: (request: AssistantRequest) => void;
}
