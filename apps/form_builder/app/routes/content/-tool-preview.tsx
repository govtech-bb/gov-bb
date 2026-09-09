import { useEffect, useRef, useState } from "react";
import type {
  ContentObject,
  SmartToolDefinition,
} from "@govtech-bb/content/smart-tool-fields";
import s from "./-styles.module.css";
import t from "./-tools.module.css";

const landingUrl =
  import.meta.env.VITE_LANDING_PREVIEW_URL ||
  "http://localhost:4000/preview-start-page";
const previewUrl = (() => {
  try {
    return new URL("/preview-smart-tool", landingUrl);
  } catch {
    return null;
  }
})();

export function ToolPreview({
  definition,
  content,
  recordId,
}: {
  definition: SmartToolDefinition;
  content: ContentObject | null;
  recordId?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [view, setView] = useState(definition.views[0].id);
  const [outcome, setOutcome] = useState("done");
  const [feedState, setFeedState] = useState("notices");
  const [connected, setConnected] = useState(false);
  const data = {
    source: "gov-bb-smart-tool-editor",
    version: 1,
    id: definition.id,
    view,
    content,
    recordId,
    outcome,
    feedState,
  };
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });
  useEffect(() => {
    if (!previewUrl) return;
    function receive(event: MessageEvent) {
      if (
        event.origin !== previewUrl?.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== "gov-bb-smart-tool-preview" ||
        event.data?.version !== 1
      )
        return;
      setConnected(true);
      frame.current?.contentWindow?.postMessage(
        latest.current,
        previewUrl.origin,
      );
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (!previewUrl) return;
    const timer = setTimeout(
      () =>
        frame.current?.contentWindow?.postMessage(
          latest.current,
          previewUrl.origin,
        ),
      150,
    );
    return () => clearTimeout(timer);
  }, [content, view, outcome, recordId, feedState]);
  if (!previewUrl)
    return (
      <p role="alert">
        Preview is unavailable. Ask an administrator to check the preview
        address.
      </p>
    );
  return (
    <aside className={t.preview} aria-label="Smart tool preview">
      <label className={s.label}>
        Preview page
        <select
          className={s.select}
          value={view}
          onChange={(event) => setView(event.target.value)}
        >
          {definition.views.map((page) => (
            <option key={page.id} value={page.id}>
              {page.label}
            </option>
          ))}
        </select>
      </label>
      {definition.id === "water-outages" && view !== "page" && (
        <label className={s.label}>
          Message state
          <select
            className={s.select}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            <option value="done">Completed</option>
            <option value="already">Already completed</option>
            <option value="invalid">Invalid link</option>
            <option value="unavailable">Service unavailable</option>
          </select>
        </label>
      )}
      {definition.id === "water-outages" && view === "page" && (
        <label className={s.label}>
          Feed example
          <select
            className={s.select}
            value={feedState}
            onChange={(event) => setFeedState(event.target.value)}
          >
            <option value="notices">Sample notice</option>
            <option value="empty">No notices</option>
            <option value="unavailable">Feed unavailable</option>
          </select>
        </label>
      )}
      {!content && (
        <p role="status">Complete the fields to update the preview.</p>
      )}
      {!connected && (
        <p className={t.hint}>
          Connecting to preview… If this continues, check that the preview
          service is available.
        </p>
      )}
      <iframe
        ref={frame}
        src={previewUrl.href}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
        allow="geolocation"
        title={`${definition.title} preview`}
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(
            latest.current,
            previewUrl.origin,
          )
        }
      />
    </aside>
  );
}
