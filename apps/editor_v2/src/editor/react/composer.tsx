import { registerEditorEditability, setEditorReadOnly } from "../core/editability";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import {
  defineExtension,
  mergeRegister,
  SKIP_DOM_SELECTION_TAG,
  type SerializedEditorState,
} from "lexical";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LinkPage } from "../../ui/link-picker";
import type { EditorDefinition } from "../core/definition";
import { createHeadlessEditor } from "../core/create-editor";
import { registerEditorDefinition } from "../core/context";
import {
  $restoreEditorSelection,
  registerEditorSession,
  type EditorSession,
} from "../core/session";
import { activateEditor, registerEditorScope } from "./active-editor";

const DefinitionContext = createContext<EditorDefinition | null>(null);

const SessionContext = createContext<EditorSession | undefined>(undefined);

/**
 * Opens the editor inside on its document's session, which the host keeps while the document's view is closed: the
 * editor carries on its undo history and selection, and leaves them there when it closes.
 */
export function EditorSessionProvider({
  session,
  children,
}: {
  session: EditorSession;
  children: ReactNode;
}) {
  return <SessionContext value={session}>{children}</SessionContext>;
}

const LinkPagesContext = createContext<readonly LinkPage[]>([]);

/** The pages the host lets a link find by title, from EditorComposer's linkPages; none without a host that knows them. */
export const useLinkPages = () => useContext(LinkPagesContext);

export function useEditorDefinition() {
  const definition = useContext(DefinitionContext);

  if (!definition) throw new Error("EditorComposer is missing");

  return definition;
}

function Ownership({ children, readOnly }: { children: ReactNode; readOnly?: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [scope, setScope] = useState<HTMLDivElement | null>(null);
  useEffect(() => (scope ? registerEditorScope(editor, scope) : undefined), [editor, scope]);
  useEffect(() => {
    if (readOnly !== undefined) setEditorReadOnly(editor, readOnly);
  }, [editor, readOnly]);

  return (
    <div
      ref={setScope}
      className="contents"
      onFocusCapture={(event) => activateEditor(editor, event.target)}
      onPointerDownCapture={(event) => activateEditor(editor, event.target)}
    >
      {children}
    </div>
  );
}

const noPages: readonly LinkPage[] = [];

export function EditorComposer({
  definition,
  initialState,
  initialize,
  readOnly,
  linkPages = noPages,
  children,
}: {
  definition: EditorDefinition;
  initialState?: SerializedEditorState;
  initialize?: () => void;
  readOnly?: boolean;
  /** The pages a link can find by title, such as the site's: the host knows them, the editor doesn't. */
  linkPages?: readonly LinkPage[];
  children: ReactNode;
}) {
  const session = useContext(SessionContext);

  const [mounted] = useState(() => {
    const prepared = createHeadlessEditor(definition, initialState, { initialize });
    let state: SerializedEditorState;

    try {
      state = prepared.getEditorState().toJSON();
    } finally {
      prepared.dispose();
    }

    const extension = defineExtension({
      name: `${definition.namespace}/mounted`,
      namespace: definition.namespace,
      nodes: [...new Set(definition.nodes.map((item) => item.node))],
      theme: structuredClone(definition.theme),
      dependencies: [...definition.browserExtensions],
      $initialEditorState: JSON.stringify(state),
      onError: (error) => {
        throw error;
      },
      register: (editor) => {
        const cleanup: (() => void)[] = [
          registerEditorDefinition(editor, definition),
          registerEditorEditability(editor),
        ];

        // Before the definition's own, so its history carries on the session's
        if (session) cleanup.push(registerEditorSession(editor, session));

        try {
          for (const item of definition.registrations) cleanup.push(item.register(editor));
        } catch (error) {
          mergeRegister(...cleanup)();
          throw error;
        }

        return mergeRegister(...cleanup);
      },
      // The selection goes back once the editor is on the page, leaving the page's own selection alone: moving it
      // would take the author's focus from wherever it is, which a view that stayed mounted doesn't do
      afterRegistration: (editor) => {
        if (!session?.selection) return () => {};

        let restored = false;

        return editor.registerRootListener((root) => {
          if (!root || restored) return;
          restored = true;
          queueMicrotask(() =>
            editor.update(() => $restoreEditorSelection(session), { tag: SKIP_DOM_SELECTION_TAG }),
          );
        });
      },
    });

    return { definition, extension };
  });

  if (definition !== mounted.definition)
    throw new Error("Editor configuration is fixed per mount; remount to change it");

  return (
    <DefinitionContext value={definition}>
      <LexicalExtensionComposer extension={mounted.extension} contentEditable={null}>
        <LinkPagesContext value={linkPages}>
          <Ownership readOnly={readOnly}>{children}</Ownership>
        </LinkPagesContext>
      </LexicalExtensionComposer>
    </DefinitionContext>
  );
}
