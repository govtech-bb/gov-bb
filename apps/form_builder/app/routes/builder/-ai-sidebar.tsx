import { useState, useRef, useEffect } from "react";
import {
  AiMagicIcon,
  ArrowRight01Icon,
  Attachment02Icon,
  Cancel01Icon,
} from "hugeicons-react";
import { serializeRecipeDraft } from "@govtech-bb/form-builder";
import s from "../../styles/builder.module.css";
import type { RecipeDraft, UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import {
  startEditRecipe,
  getEditStatus,
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

// Shared poll loop for both async jobs (Edit Form + PDF upload). Sleeps
// `firstPollMs` before the first poll (aggressive-first so a fast edit returns
// almost synchronously), then `intervalMs` between subsequent polls, giving up
// after `timeoutMs`. Non-terminal statuses ("processing"/"generating") keep
// polling; "failed" throws its reason; "done" returns that branch of the union.
// Throws on abort so the caller's `abort.signal.aborted` check swallows it.
async function pollUntilDone<T extends { status: string }>(
  getStatus: () => Promise<T>,
  abort: AbortController,
  opts: { firstPollMs: number; intervalMs: number; timeoutMs: number },
): Promise<Extract<T, { status: "done" }>> {
  const start = Date.now();
  let delay = opts.firstPollMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((r) => setTimeout(r, delay));
    delay = opts.intervalMs;
    if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (Date.now() - start > opts.timeoutMs) {
      throw new Error(
        "This is taking longer than expected. Please try again later.",
      );
    }

    const status = await getStatus();
    if (status.status === "processing" || status.status === "generating") {
      continue;
    }
    if (status.status === "done") {
      return status as Extract<T, { status: "done" }>;
    }
    if (status.status === "failed") {
      const reason = (status as { reason?: string }).reason;
      throw new Error(reason ?? "The request failed — please try again.");
    }
    // Any other status is unexpected (the server unions are exhaustive, and a
    // non-200 throws ApiError before reaching here) — surface it rather than
    // returning a recipe-less "done".
    throw new Error(`Unexpected status: ${status.status}`);
  }
}

interface AiSidebarProps {
  // The live draft, so Edit Form can send the current recipe.
  draft: RecipeDraft;
  onApplyRecipe: (
    recipe: ServiceContractRecipe,
    unresolvableRefs: UnknownRef[],
  ) => Promise<ApplyRecipeResult>;
}

// Hard cap for the direct-to-S3 upload. The browser PUTs the raw file straight
// to a presigned S3 URL (no base64, no Amplify Lambda body limit), so this can
// be the same ceiling the API enforces on its presign side — 20 MB.
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function AiSidebar({ draft, onApplyRecipe }: AiSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A generated recipe whose apply *rejected* (the editor pipeline crashed, as
  // opposed to a resolved { error } validation verdict). Stashed so Retry
  // apply can re-run onApplyRecipe from memory instead of forcing the user
  // back through the billed upload/Textract/Bedrock pipeline (#1873).
  const [pendingApply, setPendingApply] = useState<{
    recipe: ServiceContractRecipe;
    unresolvableRefs: UnknownRef[];
  } | null>(null);
  // True while an apply is in flight. The pipeline validates over the network
  // before it loads, so this window is real: lock out a second Retry click and
  // any new job start, or a stale apply's continuation would clobber the newer
  // job's state.
  const [applying, setApplying] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Needed to reset the hidden file input when the staged file is removed —
  // without it, re-picking the same file fires no change event.
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Abort handle for the in-flight upload + poll loop. Held in a ref so the
  // unmount cleanup and a follow-up upload can both cancel it without
  // re-triggering effects.
  const pollAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => pollAbortRef.current?.abort(), []);

  useEffect(() => {
    // Optional-chain the method too: jsdom (test env) doesn't implement it.
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  // Surface a server-fn failure. Both AI actions are now async jobs (start →
  // poll), so neither makes a single long Bedrock call that could hit the
  // Amplify ~28s SSR timeout and surface as the cryptic "Invariant failed"
  // (#1129). start/status calls are sub-second; the API returns user-friendly
  // reasons (a failed generation's reason, an expired-session 404) which we
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
    await applyRecipe(
      recipe as unknown as ServiceContractRecipe,
      unresolvableRefs,
    );
  };

  // Apply-and-report, shared by handleResponse and the Retry apply action. A
  // rejection means the editor pipeline crashed — the generation itself
  // succeeded, so stash the recipe for retry rather than routing the error
  // through the callers' upload/edit catches with a misleading message
  // (#1532, #1871). The resolved paths clear the stash, except "cancelled":
  // the user declined the dirty-form overwrite prompt, and retry must stay
  // available (e.g. after they save) or they're forced back through a billed
  // regeneration.
  const applyRecipe = async (
    recipe: ServiceContractRecipe,
    unresolvableRefs: UnknownRef[],
  ) => {
    setApplying(true);
    let result: ApplyRecipeResult;
    try {
      result = await onApplyRecipe(recipe, unresolvableRefs);
    } catch {
      setPendingApply({ recipe, unresolvableRefs });
      setError("Couldn't apply the recipe to the editor.");
      return;
    } finally {
      setApplying(false);
    }
    if (result.error) {
      // Deterministic validation verdict — a retry would fail identically.
      setPendingApply(null);
      setError(result.error);
    } else if (result.applied) {
      setPendingApply(null);
      setError(null);
      pushStatus(
        "✓ Applied to the editor — not saved yet. Use Save draft to keep it, or Discard to undo.",
      );
    } else if (result.reason === "unchanged") {
      setPendingApply(null);
      pushStatus("The AI returned the form unchanged — nothing to apply.");
    }
    // reason === "cancelled" is the user's own choice — stay silent.
  };

  const handleUpload = async () => {
    if (!pdfFile || loading || applying) return;
    setLoading(true);
    setError(null);
    // A fresh job supersedes any recipe held for retry.
    setPendingApply(null);
    // Steering context typed in the prompt box rides along with the upload
    // (e.g. "make every field optional"). Empty box → blind convert as before.
    const context = input.trim();
    setMessages((m) => [
      ...m,
      {
        role: "user",
        content: context
          ? `📎 Uploaded ${pdfName ?? "file"}\n${context}`
          : `📎 Uploaded ${pdfName ?? "file"}`,
      },
    ]);
    if (context) setInput("");

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

      const { jobId } = await startPdfConvert({
        data: { s3Key, ...(context ? { context } : {}) },
      });

      // Textract + Bedrock can take a while, so poll at a steady 2s up to 3 min.
      const status = await pollUntilDone(
        () => getPdfConvertStatus({ data: { jobId } }),
        abort,
        { firstPollMs: 2000, intervalMs: 2000, timeoutMs: 3 * 60_000 },
      );

      setPdfFile(null);
      setPdfName(null);
      await handleResponse(status.reply, status.recipe, status.unresolvableRefs);
    } catch (err) {
      // Swallow errors caused by our own abort — the user (or unmount)
      // requested cancellation, so we don't surface it.
      if (abort.signal.aborted) return;
      setError(toMessage(err));
      // The upload path has several failure points (presign, S3 PUT, convert).
      // Restore the typed context so a failed upload doesn't make the user
      // retype it — but only if they haven't started a new prompt meanwhile.
      if (context) setInput((cur) => (cur ? cur : context));
    } finally {
      if (pollAbortRef.current === abort) pollAbortRef.current = null;
      setLoading(false);
    }
  };

  const handleEditForm = async () => {
    const message = input.trim();
    if (!message || loading || applying) return;
    setInput("");
    setLoading(true);
    setError(null);
    // A fresh job supersedes any recipe held for retry.
    setPendingApply(null);
    setMessages((m) => [...m, { role: "user", content: message }]);

    // Cancel any prior in-flight poll before starting a fresh one, then publish
    // the new controller so unmount-cleanup and an overlapping submit both see
    // it (shared with handleUpload).
    pollAbortRef.current?.abort();
    const abort = new AbortController();
    pollAbortRef.current = abort;

    try {
      const recipeJson = JSON.stringify(serializeRecipeDraft(draft));
      const { jobId } = await startEditRecipe({ data: { message, recipeJson } });

      // Fast-first cadence: a 2–3s edit returns on the first or second poll and
      // feels essentially synchronous; the 3-min cap matches the upload path.
      const status = await pollUntilDone(
        () => getEditStatus({ data: { jobId } }),
        abort,
        { firstPollMs: 400, intervalMs: 2000, timeoutMs: 3 * 60_000 },
      );
      await handleResponse(status.reply, status.recipe, status.unresolvableRefs);
    } catch (err) {
      // Swallow errors caused by our own abort (overlapping submit / unmount).
      // A failed generation surfaces its reason; an expired-session 404 (the
      // job was lost to a restart) surfaces the API's interrupted message.
      if (abort.signal.aborted) return;
      setError(toMessage(err));
    } finally {
      if (pollAbortRef.current === abort) pollAbortRef.current = null;
      setLoading(false);
    }
  };

  // User-requested cancel of the in-flight job: the poll loop throws on the
  // abort and both handlers swallow it (same path as unmount cleanup).
  const handleStop = () => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    setLoading(false);
    pushStatus("Stopped.");
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
      <div className={s.aiCollapsedBar}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => setCollapsed(false)}
          title="Open AI assistant"
          aria-label="Open AI assistant"
        >
          <AiMagicIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <aside className={s.aiSidebar} aria-label="AI assistant">
      <div className={s.aiHeader}>
        <h3 className={s.aiTitle}>
          <AiMagicIcon size={15} />
          AI Assistant
        </h3>
        <button
          type="button"
          className={s.railIconBtn}
          onClick={() => setCollapsed(true)}
          title="Collapse AI assistant"
          aria-label="Collapse AI assistant"
        >
          <ArrowRight01Icon size={16} />
        </button>
      </div>

      <div className={s.aiTranscript}>
        {messages.length === 0 && (
          <div className={s.aiEmpty}>
            <AiMagicIcon size={26} />
            <p>
              Upload a PDF or image to turn it into a form, or describe a
              change to the current form.
            </p>
          </div>
        )}
        {messages.map((msg, i) =>
          msg.role === "status" ? (
            <div key={i} className={s.aiStatus}>
              {msg.content}
            </div>
          ) : (
            <div
              key={i}
              className={`${s.aiBubble} ${
                msg.role === "user" ? s.aiBubbleUser : s.aiBubbleAi
              }`}
            >
              {msg.content}
            </div>
          ),
        )}
        {loading && (
          <div className={s.aiThinking}>
            <span className="t-shimmer" data-text="Thinking…">
              Thinking…
            </span>
            <button
              type="button"
              className={s.aiStopBtn}
              onClick={handleStop}
            >
              Stop
            </button>
          </div>
        )}
        {error && (
          <div className={s.aiError} role="alert">
            {error}
          </div>
        )}
        {pendingApply && (
          <button
            type="button"
            className={s.aiRetryBtn}
            disabled={applying}
            onClick={() =>
              applyRecipe(pendingApply.recipe, pendingApply.unresolvableRefs)
            }
          >
            Retry apply
          </button>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className={s.aiComposer}>
        {pdfFile && (
          <span className={s.aiAttachChip} title={pdfName ?? undefined}>
            <Attachment02Icon size={13} />
            <span className={s.aiAttachName}>{pdfName}</span>
            <button
              type="button"
              className={s.aiAttachClear}
              aria-label="Remove attachment"
              title="Remove attachment"
              disabled={loading}
              onClick={() => {
                setPdfFile(null);
                setPdfName(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <Cancel01Icon size={11} />
            </button>
          </span>
        )}
        <form
          className={s.aiComposerCard}
          onSubmit={(e) => {
            e.preventDefault();
            handleEditForm();
          }}
        >
          <textarea
            className={s.aiTextarea}
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
            rows={2}
            disabled={loading}
          />
          <div className={s.aiComposerRow}>
            {/* Upload: PDF/image → recipe, standalone (no message needed). */}
            <label className={s.aiAttachBtn}>
              <Attachment02Icon size={14} />
              Attach PDF / image
              <input
                ref={fileInputRef}
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
              disabled={!pdfFile || loading || applying}
            >
              Upload
            </button>
            {/* Edit Form: a text tweak applied to the current draft. */}
            <button
              type="submit"
              className={s.btnPrimary}
              disabled={!input.trim() || loading || applying}
            >
              Edit Form
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}

