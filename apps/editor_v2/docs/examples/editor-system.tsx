import { Tooltip } from "@base-ui/react/tooltip";
import { useState } from "react";

import { createHeadlessEditor, EditorComposer } from "../../src/editor";
import { FormEditor, formSchemaToLexical, lexicalToFormSchema } from "../../src/forms";
import { DraftCanvas, FormComposer, SourceEditor } from "../../src/host";
import { PageEditor, PageTitleField } from "../../src/pages";
import { DraftStore, initialDraft, type DraftKeys, type DraftStorage } from "../../src/persistence";
import { demoForm } from "../../src/presets/demo";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

export const examplePageSource = `---
title: "Apply for a permit to play loud music"
description: "Apply for a permit for an event with amplified music."
form_id: loud-music-permit
stage: draft
---

## Before you apply

You will need the date and address of the event, and a site plan if you need to close a road.

:::notice
Apply at least 14 days before the event if you need to close a road.
:::
`;

export function initialPage(source = examplePageSource) {
  return govbbPageCodec.prepare(source);
}

export function initialForm() {
  const result = formSchemaToLexical(demoForm, govbbFormEditor);

  if (result.status !== "ready")
    throw new Error(result.diagnostics.map((issue) => issue.message).join("\n"));

  return result.state;
}

/** Native JSON → editor → Markdown → editor → native JSON. */
export function convertExample() {
  const source = govbbFormCodec.encode(initialForm());
  const loaded = govbbFormCodec.prepare(source);
  const editor = createHeadlessEditor(govbbFormEditor, loaded.state);

  try {
    return {
      source,
      reloadedSource: govbbFormCodec.encode(loaded.state),
      output: lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor),
    };
  } finally {
    editor.dispose();
  }
}

export function createExampleStore(storage: DraftStorage, keys: DraftKeys) {
  const initial = initialDraft(storage, initialForm, govbbFormCodec, keys);

  return new DraftStore(storage, initial, govbbFormCodec, keys);
}

/** Client canvases without persistence. Remount to load a different initial document. */
export function ExampleEditors({ pageSource = examplePageSource }: { pageSource?: string }) {
  const [page] = useState(() => initialPage(pageSource));
  const [form] = useState(initialForm);

  return (
    <Tooltip.Provider>
      <section aria-label="Service page">
        {page.mode === "source" ? (
          <>
            <p>{page.diagnostics.map((issue) => issue.message).join("\n")}</p>
            <textarea aria-label="Original page Markdown" value={page.source} readOnly />
          </>
        ) : (
          <EditorComposer definition={govbbPageEditor} initialState={page.state}>
            <PageTitleField />
            <PageEditor label="Service page content" />
          </EditorComposer>
        )}
      </section>
      <section aria-label="Application form">
        <EditorComposer definition={govbbFormEditor} initialState={form}>
          <FormEditor label="Application form" />
        </EditorComposer>
      </section>
    </Tooltip.Provider>
  );
}

/** Optional host binding. The host supplies storage and distinct keys for each draft. */
export function ExamplePersistedForm({
  storage,
  keys,
}: {
  storage: DraftStorage;
  keys: DraftKeys;
}) {
  const [store] = useState(() => createExampleStore(storage, keys));

  return (
    <Tooltip.Provider>
      <FormComposer definition={govbbFormEditor} store={store}>
        <SourceEditor />
        <DraftCanvas>
          <FormEditor label="Saved application form" />
        </DraftCanvas>
      </FormComposer>
    </Tooltip.Provider>
  );
}
