import { useEffect, useRef, useState } from "react";
import s from "./-styles.module.css";

/**
 * Live preview rendered by the landing app itself (Payload-style): we embed the
 * landing `/preview-start-page` route in an iframe and push the current
 * frontmatter + markdown body to it via postMessage on every change, so the
 * author sees the page exactly as it will look on alpha.gov.bb — real design
 * system, typography, and the green "Start now" button.
 *
 * The iframe fills its container; the breakpoint device width is controlled by
 * the parent's device frame. Requires the landing dev server running
 * (default :4000); point elsewhere with VITE_LANDING_PREVIEW_URL.
 */

const PREVIEW_URL =
  import.meta.env.VITE_LANDING_PREVIEW_URL ||
  "http://localhost:4000/preview-start-page";

const TARGET_ORIGIN = (() => {
  try {
    return new URL(PREVIEW_URL).origin;
  } catch {
    return "*";
  }
})();

/** The landing app's origin, for "view live" links. "" when unparseable. */
export const LANDING_ORIGIN = TARGET_ORIGIN === "*" ? "" : TARGET_ORIGIN;

const EDITOR_SOURCE = "gov-bb-start-page-editor";
const PREVIEW_SOURCE = "gov-bb-start-page-preview";

export interface StartPagePreviewData {
  frontmatter: {
    title: string;
    description?: string;
    category: string;
    stage: "alpha";
    visibility: "public" | "preview" | "draft";
    form_id: string;
    publish_date: string;
  };
  body: string;
  /** The page's would-be URL path, for the preview's breadcrumb trail. */
  path: string;
}

export function StartPagePreviewFrame({ data }: { data: StartPagePreviewData }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Latest data, read by send() without re-subscribing the handshake listener.
  const dataRef = useRef(data);
  dataRef.current = data;

  // The preview's handshake doubles as a liveness signal: if no message ever
  // arrives from the iframe, the landing app probably isn't running — say so
  // instead of leaving a silently broken pane.
  const [connected, setConnected] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const send = () => {
    frameRef.current?.contentWindow?.postMessage(
      { source: EDITOR_SOURCE, ...dataRef.current },
      TARGET_ORIGIN,
    );
  };

  // Debounced resend whenever the page data changes.
  useEffect(() => {
    const t = setTimeout(send, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // The iframe may finish loading and attach its listener after our onLoad
  // fires; it announces readiness, and we (re)send the current state.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.source === PREVIEW_SOURCE) {
        setConnected(true);
        if (event.data?.type === "ready") send();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <iframe
        ref={frameRef}
        src={PREVIEW_URL}
        title="Live preview"
        onLoad={send}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
      />
      {!connected && !timedOut && (
        <div className={s.previewHint}>
          <span className="t-shimmer" data-text="Loading preview…">
            Loading preview…
          </span>
        </div>
      )}
      {!connected && timedOut && (
        <div className={s.previewHint}>
          <span>
            Live preview can’t reach the landing app at{" "}
            <code>{TARGET_ORIGIN}</code>.
            <br />
            Locally: run <code>pnpm dev --port 4000</code> in{" "}
            <code>apps/landing</code>.
          </span>
        </div>
      )}
    </div>
  );
}
