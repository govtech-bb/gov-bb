import { useState, useRef, useEffect } from "react";
import { serializeRecipeDraft } from "@govtech-bb/form-builder";
import type { RecipeDraft, UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import {
  editRecipe,
  presignPdfUpload,
  startPdfConvert,
  getPdfConvertStatus,
} from "../../server/ai-builder/convert";
import type { ChatMessage } from "../../server/ai-builder/types";

// What the editor's apply pipeline reports back. When `applied` is false and
// there's no `error`, `reason` says why so the sidebar can speak to it:
// "unchanged" (the recipe matched the current form) gets a status line;
// "cancelled" (the user declined the dirty-form overwrite) stays silent.
export interface ApplyRecipeResult {
  applied: boolean;
  error?: string;
  reason?: "unchanged" | "cancelled";
}

// A fenced ```json … ``` block. Used both to detect that the model emitted a
// recipe blob and to strip it from the prose shown in the chat bubble.
const JSON_BLOCK = /```json\s*[\s\S]*?```/gi;

// `g`-flagged regexes carry `lastIndex` state across `.test()` calls; reset it
// so detection never depends on a prior call.
function hasRecipeJson(reply: string): boolean {
  JSON_BLOCK.lastIndex = 0;
  return JSON_BLOCK.test(reply);
}

// When a recipe was extracted, the raw JSON blob is redundant in the bubble
// (it's already captured) and is what makes the result feel "stuck in the
// chat". Strip it, leaving the model's prose; if the reply was *only* the blob,
// fall back to a short placeholder.
function stripRecipeJson(reply: string): string {
  const prose = reply.replace(JSON_BLOCK, "").trim();
  return prose.length > 0 ? prose : "Generated a form recipe.";
}

interface AiSidebarProps {
  // The live draft + working version, so Edit Form can send the current recipe.
  draft: RecipeDraft;
  version: string;
  onApplyRecipe: (
    recipe: ServiceContractRecipe,
    unresolvableRefs: UnknownRef[],
  ) => Promise<ApplyRecipeResult>;
}

// Hard cap for the direct-to-S3 upload. The browser PUTs the raw file straight
// to a presigned S3 URL (no base64, no Amplify Lambda body limit), so this can
// be the same ceiling the API enforces on its presign side — 20 MB.
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function AiSidebar({ draft, version, onApplyRecipe }: AiSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Abort handle for the in-flight upload + poll loop. Held in a ref so the
  // unmount cleanup and a follow-up upload can both cancel it without
  // re-triggering effects.
  const pollAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => pollAbortRef.current?.abort(), []);

  useEffect(() => {
    // Optional-chain the method too: jsdom (test env) doesn't implement it.
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  // Surface a server-fn failure. The async upload flow no longer pushes a
  // large PDF body through the Amplify Lambda, so the cryptic "Invariant
  // failed" 413 from #583 isn't reachable here — the API now returns
  // user-friendly reasons (password-protected, too many pages, etc.) which we
  // pass through verbatim.
  const toMessage = (err: unknown): string => {
    return err instanceof Error ? err.message : "Unknown error";
  };

  // Shared tail for both actions: append the assistant reply, then apply the
  // recipe (if any) through the editor's validate-then-load pipeline.
  // `unresolvableRefs` (computed server-side against the full catalog) rides
  // along so the editor can warn-but-still-load when the model hallucinated a
  // ref. Deploy stays the hard gate (#504).
  const pushStatus = (content: string) =>
    setMessages((m) => [...m, { role: "status", content }]);

  const handleResponse = async (
    reply: string,
    recipe: Record<string, unknown> | null,
    unresolvableRefs: UnknownRef[] = [],
  ) => {
    if (!recipe) {
      // No recipe to apply. Show the reply verbatim — if it contains a JSON
      // block, that blob is the diagnostic for the extraction miss below.
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      // A fenced json block with no parsed recipe means extraction failed.
      // Flag it rather than leaving the blob sitting silently in the chat; a
      // plain conversational reply (no block) needs no status.
      if (hasRecipeJson(reply)) {
        pushStatus(
          "I generated a recipe but couldn't read it automatically — please try the request again.",
        );
      }
      return;
    }

    // A recipe was extracted: the raw blob is redundant, so show prose only.
    setMessages((m) => [
      ...m,
      { role: "assistant", content: stripRecipeJson(reply) },
    ]);
    const result = await onApplyRecipe(
      recipe as unknown as ServiceContractRecipe,
      unresolvableRefs,
    );
    if (result.error) {
      setError(result.error);
    } else if (result.applied) {
      pushStatus(
        "✓ Applied to the editor — not saved yet. Use Save draft to keep it, or Discard to undo.",
      );
    } else if (result.reason === "unchanged") {
      pushStatus("The AI returned the form unchanged — nothing to apply.");
    }
    // reason === "cancelled" is the user's own choice — stay silent.
  };

  const handleUpload = async () => {
    if (!pdfFile || loading) return;
    setLoading(true);
    setError(null);
    setMessages((m) => [
      ...m,
      { role: "user", content: `📎 Uploaded ${pdfName ?? "file"}` },
    ]);

    // Cancel any prior in-flight poll before starting a fresh one, then
    // publish the new controller so unmount-cleanup and an overlapping click
    // both see it.
    pollAbortRef.current?.abort();
    const abort = new AbortController();
    pollAbortRef.current = abort;

    try {
      const { url, s3Key } = await presignPdfUpload();
      const putResponse = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: pdfFile,
        signal: abort.signal,
      });
      if (!putResponse.ok) {
        throw new Error("Upload failed — please refresh and try again.");
      }

      const { jobId } = await startPdfConvert({ data: { s3Key } });

      const start = Date.now();
      const TIMEOUT_MS = 3 * 60_000;
      const POLL_MS = 2000;

      while (!abort.signal.aborted) {
        if (Date.now() - start > TIMEOUT_MS) {
          throw new Error(
            "This upload is taking longer than expected. Please try a smaller PDF or try again later.",
          );
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (abort.signal.aborted) return;

        const status = await getPdfConvertStatus({ data: { jobId } });
        if (status.status === "processing") continue;
        if (status.status === "failed") throw new Error(status.reason);

        // done
        setPdfFile(null);
        setPdfName(null);
        await handleResponse(status.reply, status.recipe, status.unresolvableRefs);
        return;
      }
    } catch (err) {
      // Swallow errors caused by our own abort — the user (or unmount)
      // requested cancellation, so we don't surface it.
      if (abort.signal.aborted) return;
      setError(toMessage(err));
    } finally {
      if (pollAbortRef.current === abort) pollAbortRef.current = null;
      setLoading(false);
    }
  };

  const handleEditForm = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    setLoading(true);
    setError(null);
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const recipeJson = JSON.stringify(serializeRecipeDraft(draft, { version }));
      const { recipe, reply, unresolvableRefs } = await editRecipe({
        data: { message, recipeJson },
      });
      await handleResponse(reply, recipe, unresolvableRefs);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PDF_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setError(
        `File is ${mb} MB; maximum is 20 MB. Please use a smaller file or split it into separate pages.`,
      );
      // Clear the picker so the same file can be re-selected after shrinking it.
      e.target.value = "";
      return;
    }
    setError(null);
    setPdfName(file.name);
    setPdfFile(file);
  };

  if (collapsed) {
    return (
      <div style={styles.collapsedBar}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={styles.expandButton}
          title="Open AI assistant"
          aria-label="Open AI assistant"
        >
          🤖
        </button>
      </div>
    );
  }

  return (
    <aside style={styles.sidebar} aria-label="AI assistant">
      <div style={styles.header}>
        <h3 style={styles.heading}>AI Assistant</h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={styles.collapseButton}
          title="Collapse AI assistant"
          aria-label="Collapse AI assistant"
        >
          ⟩
        </button>
      </div>

      <div style={styles.transcript}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>
            Upload a PDF or image to turn it into a form, or describe a change to
            the current form.
          </p>
        )}
        {messages.map((msg, i) =>
          msg.role === "status" ? (
            <div key={i} style={styles.status}>
              {msg.content}
            </div>
          ) : (
            <div
              key={i}
              style={{
                ...styles.bubble,
                ...(msg.role === "user" ? styles.userBubble : styles.aiBubble),
              }}
            >
              <strong style={styles.bubbleRole}>
                {msg.role === "user" ? "You" : "AI Assistant"}
              </strong>
              <div style={styles.bubbleText}>{msg.content}</div>
            </div>
          ),
        )}
        {loading && <div style={styles.thinking}>Thinking…</div>}
        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div style={styles.actions}>
        {/* Upload: PDF/image → recipe, standalone (no message needed). */}
        <div style={styles.uploadRow}>
          <label style={styles.fileLabel}>
            {pdfFile ? `✓ ${pdfName}` : "📎 Attach PDF / image"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              style={{ display: "none" }}
              disabled={loading}
            />
          </label>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!pdfFile || loading}
            style={{
              ...styles.button,
              ...(!pdfFile || loading ? styles.buttonDisabled : {}),
            }}
          >
            Upload
          </button>
        </div>

        {/* Edit Form: a text tweak applied to the current draft. */}
        <form
          style={styles.editRow}
          onSubmit={(e) => {
            e.preventDefault();
            handleEditForm();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter inserts a newline. Mirrors the
              // form's own onSubmit so the button and the keyboard agree.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEditForm();
              }
            }}
            placeholder="e.g. make the email field required"
            rows={3}
            style={styles.textInput}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            style={{
              ...styles.button,
              ...(!input.trim() || loading ? styles.buttonDisabled : {}),
            }}
          >
            Edit Form
          </button>
        </form>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 380,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderLeft: "1px solid #e0e0e0",
    background: "#fafafa",
    fontFamily: "system-ui",
  },
  collapsedBar: {
    width: 44,
    flexShrink: 0,
    display: "flex",
    justifyContent: "center",
    paddingTop: 12,
    borderLeft: "1px solid #e0e0e0",
    background: "#fafafa",
  },
  expandButton: {
    width: 32,
    height: 32,
    border: "1px solid #ddd",
    borderRadius: 6,
    background: "#fff",
    cursor: "pointer",
    fontSize: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #e0e0e0",
  },
  heading: { margin: 0, fontSize: 16 },
  collapseButton: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 18,
    color: "#666",
  },
  transcript: { flex: 1, overflow: "auto", padding: 16 },
  placeholder: { color: "#999", fontSize: 14, textAlign: "center", marginTop: 24 },
  bubble: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    maxWidth: "90%",
    whiteSpace: "pre-wrap",
    fontSize: 14,
  },
  userBubble: { background: "#e3f2fd", marginLeft: "auto" },
  aiBubble: { background: "#f0f0f0" },
  bubbleRole: { fontSize: 11, color: "#666" },
  bubbleText: { marginTop: 4 },
  thinking: { color: "#666", fontStyle: "italic", fontSize: 14 },
  status: {
    margin: "4px 0 12px",
    padding: "6px 10px",
    borderLeft: "3px solid #90caf9",
    background: "#f5faff",
    color: "#37474f",
    fontSize: 13,
  },
  error: {
    color: "#b71c1c",
    background: "#ffebee",
    padding: 8,
    borderRadius: 6,
    fontSize: 13,
    marginTop: 8,
  },
  actions: {
    borderTop: "1px solid #e0e0e0",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  uploadRow: { display: "flex", gap: 8, alignItems: "center" },
  fileLabel: {
    flex: 1,
    cursor: "pointer",
    padding: "8px 10px",
    background: "#eef2f7",
    borderRadius: 6,
    fontSize: 13,
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  editRow: { display: "flex", gap: 8, alignItems: "flex-start" },
  textInput: {
    flex: 1,
    padding: "8px 10px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "inherit",
    lineHeight: 1.4,
    resize: "vertical",
    minHeight: 38,
    // Wrap long prompts instead of scrolling them off to the right.
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  },
  button: {
    padding: "8px 14px",
    background: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  buttonDisabled: { background: "#cfd8dc", color: "#90a4ae", cursor: "default" },
};
