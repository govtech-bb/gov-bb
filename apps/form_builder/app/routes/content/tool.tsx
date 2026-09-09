import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { smartTool, TOOL_KIND_LABELS } from "@govtech-bb/content/smart-tools";
import {
  contentPath,
  contentSchema,
  displayContent,
  recordLabel,
  prepareContentChange,
  sameContent,
  withContentFields,
  type ContentObject,
  type ContentField,
} from "@govtech-bb/content/smart-tool-fields";
import {
  loadSmartTool,
  publishSmartTool,
  type LoadedSmartTool,
} from "./-tools-server";
import { clearDraft, draftKeyFor, readDraft, writeDraft } from "./-draft-store";
import { ToolField } from "./-tool-fields";
import { ToolPreview } from "./-tool-preview";
import { useTheme } from "./-use-theme";
import s from "./-styles.module.css";
import t from "./-tools.module.css";

export const Route = createFileRoute("/content/tool")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: ({ deps }) => loadSmartTool({ data: deps }),
  component: ToolPage,
});

interface ToolDraft {
  base: LoadedSmartTool;
  content: ContentObject;
  removals: string[];
}

function ToolPage() {
  const loaded = Route.useLoaderData();
  return <SmartToolEditor key={loaded.id} loaded={loaded} />;
}

function validationErrors(
  error: unknown,
  fields: Record<string, ContentField>,
  content: ContentObject,
) {
  const issues = (
    error as { issues?: { path: (string | number)[]; message: string }[] }
  )?.issues;
  if (!issues)
    return [
      {
        path: "",
        section: "",
        label: "",
        message:
          error instanceof Error
            ? error.message
            : "The change could not be saved. Try again.",
      },
    ];
  return issues.map((issue) => {
    let field: ContentField | undefined = { type: "object", label: "", fields };
    let value: unknown = content;
    let path = "";
    const labels: string[] = [];
    for (const key of issue.path) {
      const next =
        value && typeof value === "object"
          ? (value as ContentObject)[key]
          : undefined;
      const identity = field?.type === "array" ? field.identity : undefined;
      path = contentPath(
        path,
        identity && next && typeof next === "object"
          ? String((next as ContentObject)[identity])
          : key,
      );
      if (field?.type === "array") {
        labels.push(recordLabel(next, identity));
        field = field.item;
      } else {
        field = field?.fields?.[key];
        if (field) labels.push(field.label);
      }
      value = next;
    }
    return {
      path,
      section: String(issue.path[0] ?? ""),
      label: labels.join(" › "),
      message: issue.message,
    };
  });
}

export function SmartToolEditor({ loaded }: { loaded: LoadedSmartTool }) {
  useTheme();
  const key = draftKeyFor(`smart-tool:${loaded.id}:1`);
  const [state, setState] = useState<ToolDraft>({
    base: loaded,
    content: loaded.content,
    removals: [],
  });
  const [restored, setRestored] = useState(false);
  const [draftWarning, setDraftWarning] = useState("");
  useEffect(() => {
    const stored = readDraft<ToolDraft>(key);
    if (stored) {
      try {
        if (
          stored.base?.id !== loaded.id ||
          stored.content?.schemaVersion !== 1 ||
          !Array.isArray(stored.removals) ||
          !stored.removals.every((path) => typeof path === "string") ||
          !stored.base.revision?.sha
        )
          throw new Error();
        contentSchema(
          withContentFields(smartTool(loaded.id), loaded.content),
        ).parse(stored.base.content);
        setState(stored);
      } catch {
        setDraftWarning(
          "A saved draft could not be restored. It has been kept in this browser. Discard it and reload to start a new draft.",
        );
      }
    }
    setRestored(true);
  }, [key, loaded]);
  const definition = useMemo(
    () => withContentFields(smartTool(loaded.id), state.base.content),
    [loaded.id, state.base.content],
  );
  const [section, setSection] = useState(Object.keys(definition.fields)[0]);
  const [recordId, setRecordId] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof validationErrors>>([]);
  const fieldErrors = useMemo(
    () =>
      Object.fromEntries(
        errors
          .filter((error) => error.path)
          .map((error) => [error.path, error.message]),
      ),
    [errors],
  );
  const setError = (cause: unknown) =>
    setErrors(
      cause ? validationErrors(cause, definition.fields, state.content) : [],
    );
  const [saved, setSaved] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [success, setSuccess] = useState<{
    prUrl: string;
    prNumber: number;
  } | null>(null);
  const [description, setDescription] = useState("");
  const [sourceRevision, setSourceRevision] = useState(loaded.revision);
  const errorRef = useRef<HTMLDivElement>(null);
  const prepared = useMemo(() => {
    try {
      return prepareContentChange(
        definition,
        state.base.content,
        state.content,
        state.removals,
      );
    } catch {
      return null;
    }
  }, [definition, state]);
  const dirty =
    !sameContent(state.base.content, state.content) ||
    state.removals.length > 0;
  const oldRevision = !sameContent(state.base.revision, sourceRevision);
  useEffect(() => {
    if (!restored || success || draftWarning) return;
    if (!dirty) {
      clearDraft(key);
      setSaved("");
      return;
    }
    setSaved(
      writeDraft(key, state)
        ? "Draft saved in this browser."
        : "Browser storage is unavailable. Keep this tab open until you submit the change.",
    );
  }, [key, state, dirty, success, restored, draftWarning]);
  useEffect(() => {
    if (errors.length) errorRef.current?.focus();
  }, [errors]);
  function review() {
    setError(null);
    try {
      const next = prepareContentChange(
        definition,
        state.base.content,
        state.content,
        state.removals,
      );
      if (!next.changes.length) {
        setError(new Error("There are no changes to review."));
        return;
      }
      setReviewing(true);
    } catch (cause) {
      setError(cause);
    }
  }
  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const result = await publishSmartTool({
        data: {
          id: loaded.id,
          draft: state.content,
          removals: state.removals,
          expectedRevision: state.base.revision,
          description,
        },
      });
      if (result.status === "conflict") {
        setError(new Error(result.message));
        return;
      }
      setSuccess(result);
      clearDraft(key);
      setSaved("Submitted for publication.");
    } catch (cause) {
      setError(cause);
    } finally {
      setPublishing(false);
    }
  }
  async function discard() {
    try {
      const next = await loadSmartTool({ data: { id: loaded.id } });
      clearDraft(key);
      setState({ base: next, content: next.content, removals: [] });
      setSourceRevision(next.revision);
      setDraftWarning("");
      setReviewing(false);
      setDiscarding(false);
      setError(null);
      setSaved("Latest source loaded.");
    } catch (cause) {
      setError(cause);
    }
  }
  const pharmacies = Array.isArray(state.content.pharmacies)
    ? (state.content.pharmacies as ContentObject[])
    : [];
  return (
    <div className={s.shell}>
      <header className={s.docHeader}>
        <div className={s.headerLeft}>
          <Link to="/content" className={s.secondaryBtn}>
            Back to Content
          </Link>
          <h1 className={s.docTitle}>{definition.title}</h1>
        </div>
        <span>{TOOL_KIND_LABELS[definition.kind]} · Smart tool</span>
      </header>
      <main className={t.body}>
        <p className={t.status} role="status">
          {saved ||
            (state.base.review
              ? "An update is awaiting publication."
              : "Editing the current source.")}
        </p>
        {(oldRevision || state.base.warning) && (
          <p role="alert">
            {state.base.warning ||
              "A newer source is available. Your saved draft is kept; review it before discarding and reloading."}
          </p>
        )}
        {draftWarning && <p role="alert">{draftWarning}</p>}
        {errors.length > 0 && (
          <div
            ref={errorRef}
            tabIndex={-1}
            className={s.errorBanner}
            role="alert"
          >
            <h2>Check these fields</h2>
            <ul>
              {errors.map((error, index) => (
                <li key={index}>
                  {error.path ? (
                    <button
                      type="button"
                      className={s.secondaryBtn}
                      onClick={() => {
                        setReviewing(false);
                        setSection(error.section);
                        setTimeout(
                          () =>
                            document.getElementsByName(error.path)[0]?.focus(),
                          0,
                        );
                      }}
                    >
                      {error.label}: {error.message}
                    </button>
                  ) : (
                    error.message
                  )}
                </li>
              ))}
            </ul>
            <p>Your draft has been kept.</p>
          </div>
        )}
        {success ? (
          <section>
            <h2>Change submitted</h2>
            <p>This update is awaiting checks and merge. It is not live yet.</p>
            <a href={success.prUrl} target="_blank" rel="noreferrer">
              View change #{success.prNumber}
            </a>
          </section>
        ) : (
          <div className={t.layout}>
            <div className={t.editor}>
              {reviewing && prepared ? (
                <section>
                  <h2>Review changes</h2>
                  <ul className={t.summary}>
                    {prepared.changes.map((change, index) => (
                      <li key={`${change.path}-${index}`}>
                        <strong>{change.label}</strong>
                        <p>
                          Before: {displayContent(change.before, change.format)}
                        </p>
                        <p>
                          After: {displayContent(change.after, change.format)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <label className={s.label}>
                    Reason for this change
                    <textarea
                      className={s.textarea}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                  <div className={t.actions}>
                    <button
                      className={s.secondaryBtn}
                      type="button"
                      disabled={publishing}
                      onClick={() => setReviewing(false)}
                    >
                      Continue editing
                    </button>
                    <button
                      className={s.primaryBtn}
                      type="button"
                      disabled={
                        publishing ||
                        oldRevision ||
                        Boolean(draftWarning) ||
                        !state.base.canPublish
                      }
                      onClick={() => void publish()}
                    >
                      {publishing ? "Submitting…" : "Submit for publication"}
                    </button>
                  </div>
                  {!state.base.canPublish && (
                    <p>Sign in with publishing access to submit this update.</p>
                  )}
                </section>
              ) : (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    review();
                  }}
                >
                  <label className={s.label}>
                    Content section
                    <select
                      className={s.select}
                      value={section}
                      onChange={(event) => setSection(event.target.value)}
                    >
                      {Object.entries(definition.fields).map(
                        ([name, field]) => (
                          <option key={name} value={name}>
                            {field.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <ToolField
                    errors={fieldErrors}
                    key={section}
                    field={definition.fields[section]}
                    value={state.content[section]}
                    original={state.base.content[section]}
                    path={`/${section}`}
                    onChange={(value) =>
                      setState((current) => ({
                        ...current,
                        content: { ...current.content, [section]: value },
                      }))
                    }
                    onRemove={(path, existed) =>
                      setState((current) => ({
                        ...current,
                        removals: [
                          ...current.removals.filter(
                            (removed) =>
                              removed !== path &&
                              !removed.startsWith(`${path}/`),
                          ),
                          ...(existed ? [path] : []),
                        ],
                      }))
                    }
                  />
                  <div className={t.actions}>
                    <button
                      className={s.primaryBtn}
                      type="submit"
                      disabled={Boolean(draftWarning)}
                    >
                      Review changes
                    </button>
                    <button
                      className={s.secondaryBtn}
                      type="button"
                      onClick={() => setDiscarding(true)}
                    >
                      Discard draft and reload
                    </button>
                  </div>
                </form>
              )}
              {discarding && (
                <div className={t.removeNotice} role="alert">
                  <p>Discard your unsent changes and load the latest source?</p>
                  <div className={t.actions}>
                    <button
                      className={s.primaryBtn}
                      type="button"
                      onClick={() => void discard()}
                    >
                      Discard draft and reload
                    </button>
                    <button
                      className={s.secondaryBtn}
                      type="button"
                      onClick={() => setDiscarding(false)}
                    >
                      Keep draft
                    </button>
                  </div>
                </div>
              )}
              {definition.introduction && (
                <Link
                  to="/content/edit"
                  search={{
                    path: `apps/landing/src/content/${definition.introduction}`,
                  }}
                >
                  Edit the introduction
                </Link>
              )}
            </div>
            <div>
              {pharmacies.length > 0 && (
                <label className={s.label}>
                  Pharmacy to preview
                  <select
                    className={s.select}
                    value={recordId}
                    onChange={(event) => setRecordId(event.target.value)}
                  >
                    <option value="">Choose a pharmacy</option>
                    {pharmacies.map((record) => (
                      <option
                        key={String(record.slug)}
                        value={String(record.slug)}
                      >
                        {String(record.name)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <ToolPreview
                definition={definition}
                content={prepared?.content ?? null}
                recordId={recordId}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
