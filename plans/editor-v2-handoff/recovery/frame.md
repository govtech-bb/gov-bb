# Unreviewed frame worktree recovery snapshot

Source: `/private/tmp/claude-501/-Users-phrog-Code-work-gov-bb/f9381145-23fe-41a0-a9b6-1f904ff93cae/scratchpad/wt/frame`.

This is an archival Markdown snapshot, not approved implementation. The tracked patch is relative to the recorded HEAD and includes both staged and unstaged changes. The untracked files below must also be recovered. Do not apply blindly to the integration branch.

## Base and original status

```text
61300eb34986a66cf112fbfd00aeee33e0b0d32b
 M apps/editor_v2/src/host/source-ui.tsx
 M apps/editor_v2/src/ui/document-bar.tsx
?? apps/editor_v2/src/ui/save-state.tsx
```

## Tracked patch

````diff
diff --git a/apps/editor_v2/src/host/source-ui.tsx b/apps/editor_v2/src/host/source-ui.tsx
index 24b72b9b3edf95526d9dcab8f3d0bb9080c1dcd3..beec23e87d603999344e8873d8e4a392f7128703 100644
--- a/apps/editor_v2/src/host/source-ui.tsx
+++ b/apps/editor_v2/src/host/source-ui.tsx
@@ -1,5 +1,5 @@
 import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
-import { ArrowDown, ArrowUp, Check, Code, Copy } from "@phosphor-icons/react";
+import { ArrowDown, ArrowUp, Code, Copy } from "@phosphor-icons/react";
 import {
   createContext,
   useContext,
@@ -10,12 +10,12 @@ import {
   useSyncExternalStore,
   type ReactNode,
 } from "react";
-import { Badge } from "../ui/badge";
 import { Banner } from "../ui/banner";
 import { Bar } from "../ui/bar";
 import { Button } from "../ui/button";
 import { Dialog } from "../ui/dialog";
 import { Field } from "../ui/field";
+import { SaveState, type SaveStateProps } from "../ui/save-state";
 import { Textarea } from "../ui/textarea";
 import type { DraftStore } from "../persistence/draft-store";
 import { draftEditorConnection } from "./draft-editor";
@@ -89,6 +89,7 @@ export function SourceEditor({
   inline?: boolean;
 }) {
   const draft = useDraft();
+  const save = useDraftSave(fileName);
   const [requestedOpen, setRequestedOpen] = useState(false);
   const [notice, setNotice] = useState("");
   const field = useId();
@@ -135,10 +136,16 @@ export function SourceEditor({
 
   const body = (
     <>
-      {draft.error && (
-        <Banner tone="error" className="mt-3">
-          {draft.error}
-        </Banner>
+      {save.status === "failed" ? (
+        <div className="mt-3">
+          <SaveState.Failure layout="box" {...save} />
+        </div>
+      ) : (
+        draft.error && (
+          <Banner tone="error" className="mt-3">
+            {draft.error}
+          </Banner>
+        )
       )}
       {draft.conflict && (
         <div className="mt-3 flex flex-wrap gap-2">
@@ -311,19 +318,10 @@ export function SourceEditor({
 
   const actions = (
     <>
+      {/* Saved in this browser shows in the document's bar */}
       <span role="status" className="me-auto text-14 text-muted">
-        {notice ||
-          (draft.dirty
-            ? "Unapplied changes"
-            : draft.status === "saved"
-              ? "Saved in this browser"
-              : "")}
+        {notice || (draft.dirty ? "Unapplied changes" : "")}
       </span>
-      {draft.status === "error" && (
-        <Button size="md" onClick={() => draft.store.retry()}>
-          Try saving again
-        </Button>
-      )}
       <Button
         size="md"
         onClick={() => {
@@ -387,78 +385,29 @@ export function SourceEditor({
   );
 }
 
-/** Where a draft stands against the host's own store, once the browser copy is safe. */
-export type ServerSaveStatus = "saved" | "unsaved" | "saving" | "failed";
+/**
+ * The draft's save state. A problem with the browser copy outranks the host's own status, as it's the one to fix
+ * first: a failed save, with Try again and Download a copy, or saving paused by a conflict or a draft to recover.
+ * Otherwise it's the host's, such as a page's against the content API, or saved in this browser.
+ */
+export function useDraftSave(fileName: string, server?: SaveStateProps): SaveStateProps {
+  const draft = useDraft();
 
-const serverText = {
-  saved: ["Saved", "Saved"],
-  unsaved: ["Unsaved changes", "Unsaved"],
-  saving: ["Saving…", "Saving…"],
-  failed: ["Not saved", "Unsaved"],
-} as const;
+  if (draft.status === "error")
+    return {
+      status: "failed",
+      error: draft.error,
+      onRetry: draft.store.retry,
+      onDownload: () => download(draft.source, fileName),
+    };
 
-export function DraftStatus({ server }: { server?: ServerSaveStatus }) {
-  const draft = useDraft();
+  if (draft.status === "conflict" || draft.status === "recovery")
+    return { status: "paused", error: draft.error };
 
-  // A browser-side problem outranks the host's status: it is the one to fix first.
-  const hosted = server && (draft.status === "saved" || draft.status === "saving");
-
-  const text = hosted
-    ? serverText[server][0]
-    : {
-        saving: "Saving…",
-        saved: "Saved",
-        source: "Source changes",
-        conflict: "Draft conflict",
-        recovery: "Recover draft",
-        error: "Not saved",
-      }[draft.status];
-
-  const compactText = hosted
-    ? serverText[server][1]
-    : {
-        saving: "Saving…",
-        saved: "Saved",
-        source: "Edited",
-        conflict: "Conflict",
-        recovery: "Recover",
-        error: "Unsaved",
-      }[draft.status];
-
-  // A problem stands out as a badge, on the dark form toolbar or the white page one. All's well is quiet text, in
-  // the colour of the toolbar it sits in
-  const problem = hosted
-    ? server === "failed"
-      ? "error"
-      : undefined
-    : (
-        {
-          saving: undefined,
-          saved: undefined,
-          source: "warning",
-          conflict: "warning",
-          recovery: "error",
-          error: "error",
-        } as const
-      )[draft.status];
-
-  const content = (
-    <>
-      {(hosted ? server === "saved" : draft.status === "saved") && <Check />}
-      <span className="max-sm:sr-only">{text}</span>
-      <span aria-hidden="true" className="sm:hidden">
-        {compactText}
-      </span>
-    </>
-  );
+  return server ?? { status: draft.status === "saving" ? "saving" : "local" };
+}
 
-  return (
-    <span
-      role="status"
-      title={draft.error ?? text}
-      className="flex items-center gap-1.5 text-14 whitespace-nowrap [&>svg]:size-4"
-    >
-      {problem ? <Badge tone={problem}>{content}</Badge> : content}
-    </span>
-  );
+/** The draft's save state, for a host that shows it without a document bar. */
+export function DraftStatus({ fileName = "form-source.md" }: { fileName?: string }) {
+  return <SaveState.Status {...useDraftSave(fileName)} />;
 }
diff --git a/apps/editor_v2/src/ui/document-bar.tsx b/apps/editor_v2/src/ui/document-bar.tsx
index 9c95ab165c8a3f0647565c45fd89ed5188d5c955..90c51c56d60cfa355912ddc3d0b10acb9ca8d48e 100644
--- a/apps/editor_v2/src/ui/document-bar.tsx
+++ b/apps/editor_v2/src/ui/document-bar.tsx
@@ -1,13 +1,14 @@
 import { Fragment, type ReactNode } from "react";
 import { Bar } from "./bar";
+import { SaveState, type SaveStateProps } from "./save-state";
 
 type DocumentBarProps = {
   /** Names its toolbar, such as “Page tools”. */
   label: string;
   /** The document's title: the screen's h1. */
   title: ReactNode;
-  /** Where the document stands, such as whether it's saved. */
-  status?: ReactNode;
+  /** Where its work stands: beside the title, and as a failure strip among the notices when a save fails. */
+  save?: SaveStateProps;
   /** Undo and redo. */
   undo?: ReactNode;
   preview?: ReactNode;
@@ -19,7 +20,7 @@ type DocumentBarProps = {
   publish?: ReactNode;
   /** Shows and hides the document's settings. */
   settings?: ReactNode;
-  /** What stands in the document's way, edge to edge under the bar, such as editing that's paused. */
+  /** What stands in the document's way, edge to edge under the bar after a failed save, such as editing that's paused. */
   notices?: ReactNode;
   /** Out of sight while another document is open, but still keeping count of what can be undone. */
   hidden?: boolean;
@@ -33,7 +34,7 @@ type DocumentBarProps = {
 export function DocumentBar({
   label,
   title,
-  status,
+  save,
   undo,
   preview,
   source,
@@ -76,7 +77,11 @@ export function DocumentBar({
         <Bar.Title render={<h1 />} className="max-md:grow max-md:basis-0">
           {title}
         </Bar.Title>
-        {status && <Bar.Status>{status}</Bar.Status>}
+        {save && (
+          <Bar.Status>
+            <SaveState.Status {...save} />
+          </Bar.Status>
+        )}
         {/* On a phone, the tools take their own row under the title, spread across it */}
         <Bar.Actions className="max-md:w-full max-md:justify-between">
           {groups.map(({ slot, group }, index) => (
@@ -87,7 +92,10 @@ export function DocumentBar({
           ))}
         </Bar.Actions>
       </Bar.Root>
-      {notices && <div hidden={hidden}>{notices}</div>}
+      <div hidden={hidden}>
+        {save && <SaveState.Failure {...save} />}
+        {notices}
+      </div>
     </>
   );
 }
````

## Untracked files

### apps/editor_v2/src/ui/save-state.tsx

````text
import { Check } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "./badge";
import { Banner } from "./banner";
import { Button } from "./button";

/**
 * Where a document's work stands. A browser draft is only ever saved in this browser. A page from the content API is
 * saved for everyone, and published if it's public, once the author sends it; until then its changes wait in this
 * browser. Failed is a save that went wrong, with a way to try again; paused is saving held back with editing, until
 * the author settles what paused it.
 */
export type SaveStatus =
  | "saving"
  | "local"
  | "unsaved"
  | "saved"
  | "unpublished"
  | "published"
  | "failed"
  | "paused";

const labels = new Map<SaveStatus, string>([
  ["saving", "Saving…"],
  ["local", "Saved in this browser"],
  ["unsaved", "Unsaved changes"],
  ["saved", "Saved"],
  ["unpublished", "Unpublished changes"],
  ["published", "Published"],
  ["failed", "Not saved"],
  ["paused", "Not saved"],
]);

// What's read out once a save the author asked for has gone through
const done = new Map<SaveStatus, string>([
  ["local", "Changes saved in this browser"],
  ["saved", "Changes saved"],
  ["published", "Changes published"],
]);

export type SaveStateProps = {
  status: SaveStatus;
  /** Why it isn't saved: in the failure strip, and read out as it fails. */
  error?: string;
  /** Someone else's newer version, told by a notice under the bar: read out as it arrives. */
  conflict?: string;
  /** Tries the save again, from the failure strip. */
  onRetry?: () => void;
  /** Downloads the work, to keep a copy while it can't be saved. */
  onDownload?: () => void;
};

const failing = (status: SaveStatus) => status === "failed" || status === "paused";

/**
 * What's read out, and only that: a failure, a conflict, or a save the author asked for having gone through. A
 * browser draft saving itself between keystrokes stays silent.
 */
function useAnnouncement({ status, error, conflict }: SaveStateProps) {
  const [message, setMessage] = useState("");
  const before = useRef({ status, conflict });

  useEffect(() => {
    const previous = before.current;
    before.current = { status, conflict };

    if (conflict && conflict !== previous.conflict) setMessage(conflict);
    else if (status === previous.status) return;
    else if (failing(status)) setMessage(error ?? labels.get(status)!);
    // Saving for everyone is only ever asked for, and so is getting past a failure; a draft's own saves aren't
    else if (failing(previous.status) || (previous.status === "saving" && status !== "local"))
      setMessage(done.get(status) ?? "");
  }, [status, error, conflict]);

  return message;
}

/**
 * Where the document's work stands, in the words that say who can see it: quiet while all is well, and “Not saved”
 * when it isn't. It also reads out how saving went, politely and only when it
 * matters, through a live region a dialog doesn't hide.
 */
function SaveStateStatus(props: SaveStateProps) {
  const { status } = props;
  const message = useAnnouncement(props);
  const label = labels.get(status)!;

  return (
    <>
      {failing(status) ? (
        <Badge tone={status === "failed" ? "error" : "warning"}>{label}</Badge>
      ) : (
        <span className="flex items-center gap-1.5 text-14 [&>svg]:size-4">
          {(status === "local" || status === "saved" || status === "published") && (
            <Check aria-hidden="true" />
          )}
          {label}
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}

/**
 * A failed save, edge to edge under the document's bar or boxed in a dialog: the reason, and the way out, Try again
 * and Download a copy. The status beside the title reads it out, so this doesn't too.
 */
function SaveStateFailure({
  status,
  error,
  onRetry,
  onDownload,
  layout = "strip",
}: SaveStateProps & { layout?: "strip" | "box" }) {
  if (status !== "failed") return null;

  return (
    <Banner
      tone="error"
      layout={layout}
      role="none"
      actions={
        <>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          {onDownload && <Button onClick={onDownload}>Download a copy</Button>}
        </>
      }
    >
      {error}
    </Banner>
  );
}

/** A document's save state: Status beside its title, Failure among its notices; both take the same props. */
export const SaveState = { Status: SaveStateStatus, Failure: SaveStateFailure };
````
