import { registerEditorEditability, setEditorReadOnly } from "../core/editability";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { defineExtension, mergeRegister, type SerializedEditorState } from "lexical";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EditorDefinition } from "../core/definition";
import { createHeadlessEditor } from "../core/create-editor";
import { registerEditorDefinition } from "../core/context";
import { activateEditor, registerEditorScope } from "./active-editor";

const DefinitionContext = createContext<EditorDefinition | null>(null);

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

export function EditorComposer({
  definition,
  initialState,
  initialize,
  readOnly,
  children,
}: {
  definition: EditorDefinition;
  initialState?: SerializedEditorState;
  initialize?: () => void;
  readOnly?: boolean;
  children: ReactNode;
}) {
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

        try {
          for (const item of definition.registrations) cleanup.push(item.register(editor));
        } catch (error) {
          mergeRegister(...cleanup)();
          throw error;
        }

        return mergeRegister(...cleanup);
      },
    });

    return { definition, extension };
  });

  if (definition !== mounted.definition)
    throw new Error("Editor configuration is fixed per mount; remount to change it");

  return (
    <DefinitionContext value={definition}>
      <LexicalExtensionComposer extension={mounted.extension} contentEditable={null}>
        <Ownership readOnly={readOnly}>{children}</Ownership>
      </LexicalExtensionComposer>
    </DefinitionContext>
  );
}
