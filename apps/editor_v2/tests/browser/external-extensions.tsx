import "../../index.css";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  $setSettings,
  createHeadlessEditor,
  defineEditor,
  Editor,
  EditorComposer,
  executeAction,
  FormattingModule,
  HistoryModule,
  LinksModule,
  TextModule,
  useLexicalComposerContext,
} from "../../src/editor";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  createDraftCodec,
  createFormRuntime,
  defineFormEditor,
  FormEditor,
  FormRegistryModule,
  lexicalToFormSchema,
  formSchemaToLexical,
} from "../../src/forms";
import {
  DraftCanvas,
  DraftEditorBinding,
  DraftProvider,
  DraftStatus,
  SourceEditor,
  useDraft,
} from "../../src/host";
import { DraftStore, initialDraft, type DraftCodec, type DraftKeys } from "../../src/persistence";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { $createNotice, NoticeModule } from "../extensions/notice-module";
import { NoticeFormModule } from "../extensions/notice-form";
import { ReferenceFieldModule } from "../extensions/reference-field";
import { applicantEntry, applicantRegistry } from "../extensions/applicant-preset";

const contentDefinition = defineEditor(
  [TextModule(), HistoryModule(), FormattingModule(), LinksModule(), NoticeModule()],
  "external-content",
);

const formDefinition = defineFormEditor({
  modules: [
    ...govbbFormModules,
    NoticeFormModule(),
    ReferenceFieldModule(),
    FormRegistryModule(applicantRegistry, { key: "external:applicants" }),
  ],
  namespace: "external-form",
});

const formCodec = createDraftCodec(createFormRuntime(formDefinition));

const contentCodec: DraftCodec = {
  prepare(source) {
    const state = contentDefinition.validateDocument(JSON.parse(source));

    return { state, source: JSON.stringify(state), diagnostics: [] };
  },
  encode: (state) => JSON.stringify(state),
  prepareLegacy: contentDefinition.validateDocument,
};

const keys = (name: string): DraftKeys => ({
  committed: `external:${name}:saved`,
  working: `external:${name}:working`,
  previous: `external:${name}:previous`,
  legacy: `external:${name}:legacy`,
});

function initial(kind: "content" | "form") {
  if (kind === "form") {
    const result = formSchemaToLexical(
      {
        schemaVersion: 2,
        id: "application",
        title: "Application",
        mode: "application",
        locale: "en-BB",
        timeZone: "America/Barbados",
        settings: { visibility: "draft", hiddenAnswers: "retain" },
        blocks: [{ id: "details", type: "page", role: "questions", title: "Details" }],
      },
      formDefinition,
    );

    if (result.status !== "ready")
      throw Error(result.diagnostics.map((issue) => issue.message).join("\n"));
    const editor = createHeadlessEditor(formDefinition, result.state);

    try {
      editor.update(() => $getRoot().append($createParagraphNode()), { discrete: true });

      return editor.getEditorState().toJSON();
    } finally {
      editor.dispose();
    }
  }

  const editor = createHeadlessEditor(
    kind === "content" ? contentDefinition : formDefinition,
    undefined,
    {
      initialize: () => {
        if (kind === "content")
          $getRoot().append(
            $createNotice("Content notice"),
            $createParagraphNode().append($createTextNode("Content paragraph")),
          );
        else
          $getRoot().append(
            $setSettings($createFormTitleNode().append($createTextNode("Application")), {
              logicVersion: 2,
            }),
            $createPageTitleNode().append($createTextNode("Details")),
            $createParagraphNode(),
          );
      },
    },
  );

  try {
    return editor.getEditorState().toJSON();
  } finally {
    editor.dispose();
  }
}

const contentStore = new DraftStore(
  localStorage,
  initialDraft(localStorage, () => initial("content"), contentCodec, keys("content")),
  contentCodec,
  keys("content"),
);

const formStore = new DraftStore(
  localStorage,
  initialDraft(localStorage, () => initial("form"), formCodec, keys("form")),
  formCodec,
  keys("form"),
);

const editors: Partial<Record<"content" | "form", LexicalEditor>> = {};

const detached: Partial<Record<"content" | "form", LexicalEditor>> = {};

const commits = { content: 0, form: 0 };

const fixture = {
  ready: () => !!editors.content && !!editors.form,
  state: (kind: "content" | "form") => (editors[kind] ?? detached[kind])!.getEditorState().toJSON(),
  source: (kind: "content" | "form") =>
    (kind === "content" ? contentStore : formStore).getSnapshot().source,
  status: (kind: "content" | "form") =>
    (kind === "content" ? contentStore : formStore).getSnapshot().status,
  editable: (kind: "content" | "form") => editors[kind]?.isEditable(),
  selectContent: () =>
    editors.content!.update(
      () => {
        const text = $getRoot().getLastChild<import("lexical").ElementNode>()?.getFirstChild();

        if ($isTextNode(text)) text.select(0, text.getTextContentSize());
      },
      { discrete: true },
    ),
  readOnly: (kind: "content" | "form", value: boolean) => editors[kind]!.setEditable(!value),
  schema: () => lexicalToFormSchema(editors.form!.getEditorState(), formDefinition, editors.form!),
  commits: () => ({ ...commits }),
  mounted: (kind: "content" | "form") => !!editors[kind],
};

declare global {
  interface Window {
    externalFixture: typeof fixture;
  }
}

window.externalFixture = fixture;

function Controls({ kind }: { kind: "content" | "form" }) {
  const [editor] = useLexicalComposerContext();
  const [portal, setPortal] = useState(false);
  useEffect(() => {
    editors[kind] = editor;

    const stop = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size || dirtyLeaves.size) commits[kind]++;
    });

    return () => {
      stop();
      detached[kind] = editor;
      delete editors[kind];
    };
  }, [editor, kind]);

  const insert = () =>
    executeAction(
      editor,
      kind === "form" ? formDefinition : contentDefinition,
      kind === "form" ? applicantEntry.key : "example-notice",
      { targetKey: editor.read(() => $getRoot().getLastChild()!.getKey()) },
    );

  return (
    <nav aria-label={`${kind} controls`}>
      <button onClick={insert}>Insert {kind === "form" ? "applicant" : "notice"}</button>
      {kind === "content" && (
        <button
          onClick={() => {
            if (!editor.isEditable()) return;
            editor.update(
              () => {
                if (editor.isEditable())
                  $setSettings($getRoot().getFirstChild()!, { tone: "warning" });
              },
              { tag: HISTORY_PUSH_TAG },
            );
          }}
        >
          Warning tone
        </button>
      )}
      <button onClick={() => setPortal(!portal)}>Open {kind} portal</button>
      {portal &&
        createPortal(
          <div role="region" aria-label={`${kind} portal`} className="fixture-portal">
            <button>{kind} portal focus</button>
            <input aria-label={`${kind} native input`} defaultValue="Native text" />
            <button onClick={() => setPortal(false)}>Close {kind} portal</button>
          </div>,
          document.body,
        )}
    </nav>
  );
}

function ContentSource() {
  const draft = useDraft();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(!open)}>Content source</button>
      {open && (
        <div>
          <textarea
            aria-label="Content JSON source"
            value={draft.source}
            onChange={(event) => draft.store.edit(event.target.value)}
          />
          <button onClick={() => draft.store.apply()}>Apply content</button>
          <button
            onClick={() => {
              draft.store.discard();
              setOpen(false);
            }}
          >
            Close content source
          </button>
        </div>
      )}
      <DraftStatus />
    </>
  );
}

function App() {
  const [content, setContent] = useState(true),
    [form, setForm] = useState(true);

  const [contentReadOnly, setContentReadOnly] = useState(false),
    [formReadOnly, setFormReadOnly] = useState(false);

  return (
    <>
      <header>
        <button onClick={() => setContent(!content)}>
          {content ? "Unmount" : "Mount"} content
        </button>
        <button onClick={() => setForm(!form)}>{form ? "Unmount" : "Mount"} form</button>
        <button onClick={() => setContentReadOnly(!contentReadOnly)}>
          {contentReadOnly ? "Unlock" : "Lock"} content
        </button>
        <button onClick={() => setFormReadOnly(!formReadOnly)}>
          {formReadOnly ? "Unlock" : "Lock"} form
        </button>
      </header>
      <main className="fixture-grid">
        <section aria-label="Content instance">
          <h1>Ordinary content</h1>
          {content && (
            <Editor
              definition={contentDefinition}
              initialState={contentStore.initial.state}
              readOnly={contentReadOnly}
              label="Content canvas"
            >
              <DraftProvider store={contentStore}>
                <DraftEditorBinding />
                <Controls kind="content" />
                <ContentSource />
              </DraftProvider>
            </Editor>
          )}
        </section>
        <section aria-label="Form instance">
          <h1>Full form</h1>
          {form && (
            <EditorComposer
              definition={formDefinition}
              initialState={formStore.initial.state}
              readOnly={formReadOnly}
            >
              <DraftProvider store={formStore}>
                <DraftEditorBinding />
                <Controls kind="form" />
                <SourceEditor />
                <DraftStatus />
                <DraftCanvas>
                  <FormEditor label="Form canvas" />
                </DraftCanvas>
              </DraftProvider>
            </EditorComposer>
          )}
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
