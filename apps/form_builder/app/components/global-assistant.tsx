import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Assistant, type AssistantProps } from "./ui/ai/assistant";

const AssistantWorkspace = createContext<{
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  register: React.Dispatch<React.SetStateAction<AssistantProps | null>>;
} | null>(null);

export function GlobalAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<AssistantProps | null>(null);
  const register = setConfig;
  const controls = useMemo(
    () => ({ open, setOpen, register }),
    [open, register],
  );
  return (
    <AssistantWorkspace.Provider value={controls}>
      <div className="@container/assistant flex h-dvh min-h-0 overflow-hidden bg-ui-canvas">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
        {config && (
          <Assistant
            {...config}
            conversationScope="workspace"
            open={open}
            onOpenChange={setOpen}
          />
        )}
      </div>
    </AssistantWorkspace.Provider>
  );
}

export function useGlobalAssistant() {
  const workspace = useContext(AssistantWorkspace);
  const [open, setOpen] = useState(false);
  return workspace ?? { open, setOpen };
}

// Editors supply their current document and guarded apply callback; the chat itself
// stays mounted above the router, so navigation preserves the conversation.
export function WorkspaceAssistant(props: AssistantProps) {
  const workspace = useContext(AssistantWorkspace);
  const register = workspace?.register;
  useLayoutEffect(() => {
    if (!register) return;
    register(props);
    return () => register((current) => (current === props ? null : current));
  }, [register, props]);
  return workspace ? null : <Assistant {...props} />;
}
