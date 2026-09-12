import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ServiceSnapshot, ServiceContract } from "@govtech-bb/form-types";
import { previewRecipe } from "../../server/registry";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Banner } from "../ui/banner";
import { XIcon } from "@phosphor-icons/react";
import { servicePageLabel } from "./service-model";

const landingURL =
  import.meta.env.VITE_LANDING_PREVIEW_URL ||
  (import.meta.env.DEV ? "http://localhost:4000/preview-start-page" : "");
const formsURL =
  import.meta.env.VITE_FORMS_PREVIEW_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:4318/preview-service" : "");

export function ServicePreview({
  snapshot,
  initialPageId,
  initialStepId,
  onClose,
}: {
  snapshot: ServiceSnapshot;
  initialPageId?: string;
  initialStepId?: string;
  onClose: () => void;
}) {
  // Capture once: navigation and later editor changes cannot mix revisions.
  const [captured] = useState(() => structuredClone(snapshot));
  const [pageId, setPageId] = useState(
    initialPageId ??
      captured.manifest.entryPoint ??
      captured.manifest.pages[0]?.id ??
      "form",
  );
  const [stepId, setStepId] = useState(initialStepId ?? "");
  const [contract, setContract] = useState<ServiceContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [device, setDevice] = useState("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const requested = captured.pages.find((p) => p.id === pageId);
  const redirectTarget = captured.manifest.pages.find(
    (p) => p.publicPath === requested?.frontmatter.redirect_to,
  );
  const page = captured.pages.find(
    (p) => p.id === (redirectTarget?.id ?? pageId),
  );
  const pageMeta = captured.manifest.pages.find((p) => p.id === page?.id);
  const src = page ? landingURL : captured.recipe ? formsURL : "";
  let origin = "";
  try {
    origin = new URL(src).origin;
  } catch {
    /* Invalid URLs render the unavailable state. */
  }
  useEffect(() => {
    if (!captured.recipe) return;
    let cancelled = false;
    previewRecipe({ data: { recipe: captured.recipe } })
      .then((value) => {
        if (!cancelled) {
          const { processors: _privateActions, ...publicContract } = value;
          setContract(publicContract);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [captured]);
  const send = () => {
    if (!origin) return;
    frame.current?.contentWindow?.postMessage(
      page
        ? {
            source: "gov-bb-start-page-editor",
            frontmatter: JSON.parse(JSON.stringify(page.frontmatter)),
            body: page.body,
            path: pageMeta?.publicPath,
            servicePreview: true,
          }
        : {
            source: "gov-bb-service-editor",
            contract,
            type: "snapshot",
            initialStepId: stepId || undefined,
          },
      origin,
    );
  };
  const dataRef = useRef(send);
  useLayoutEffect(() => {
    dataRef.current = send;
  });
  useEffect(() => {
    setConnected(false);
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), 7000);
    return () => clearTimeout(timer);
  }, [src, attempt, stepId]);
  useEffect(() => {
    dataRef.current();
  }, [pageId, stepId, contract]);
  useEffect(() => {
    function message(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== origin ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      if (
        !["gov-bb-start-page-preview", "gov-bb-service-preview"].includes(
          event.data.source,
        )
      )
        return;
      if (event.data.type === "ready") {
        setConnected(true);
        dataRef.current();
      }
      if (
        event.data.type === "navigate" &&
        typeof event.data.href === "string"
      ) {
        let path: string;
        try {
          path = new URL(
            event.data.href,
            `https://preview.invalid${pageMeta?.publicPath ?? "/"}`,
          ).pathname.replace(/\/$/, "");
        } catch {
          return;
        }
        const target = captured.manifest.pages.find(
          (p) => p.publicPath.replace(/\/$/, "") === path,
        );
        if (target) {
          setPageId(target.id);
          setError(null);
        } else if (path === `/forms/${captured.manifest.formId}`) {
          setPageId("form");
          setStepId("");
          setError(null);
        } else
          setError(
            "That link leaves this service snapshot. Choose another page to continue the preview.",
          );
      }
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, [origin, captured, pageMeta?.publicPath]);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog
        size="xl"
        showCloseButton={false}
        className="flex h-[90dvh] w-[95vw] max-w-none flex-col gap-3 p-3 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Dialog.Title>{captured.manifest.title}</Dialog.Title>
            <Dialog.Description>
              Preview only. Sample answers are not submitted.
            </Dialog.Description>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            shape="square"
            aria-label="Close preview"
            className="pointer-coarse:size-11"
            icon={<XIcon aria-hidden="true" />}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:flex">
          {!page && captured.recipe && (
            <div className="col-span-2 min-w-0 sm:flex-1">
              <Select
                label="Form page"
                className="w-full"
                value={stepId}
                onValueChange={(value) => {
                  setStepId(String(value ?? ""));
                  setError(null);
                }}
                items={[
                  { value: "", label: "Preview from start" },
                  ...captured.recipe.steps.map((step, index) => ({
                    value: step.stepId,
                    label: `${index + 1}. ${step.title || step.stepId}`,
                  })),
                ]}
              />
            </div>
          )}
          <div className="min-w-0 sm:flex-1">
            <Select
              label="Service section"
              className="w-full"
              value={pageId}
              onValueChange={(v) => {
                setPageId(String(v));
                setStepId("");
                setError(null);
              }}
              items={[
                ...captured.manifest.pages.map((p) => ({
                  value: p.id,
                  label: servicePageLabel(p),
                })),
                ...(captured.recipe
                  ? [{ value: "form", label: "Application form" }]
                  : []),
              ]}
            />
          </div>
          <Select
            label="Preview width"
            value={device}
            onValueChange={(v) => setDevice(String(v))}
            items={{ desktop: "Desktop", mobile: "Mobile" }}
          />
        </div>
        {!page && stepId && (
          <Banner
            variant="secondary"
            size="sm"
            title="Previewing this page"
            description="Earlier answers are empty and this page’s conditions are skipped."
            action={
              <Button
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={() => setStepId("")}
              >
                Preview from start
              </Button>
            }
            className="[&>div]:flex-wrap"
          />
        )}
        {error && (
          <Banner variant="alert" role="status">
            {error}
          </Banner>
        )}
        <div className="relative flex min-h-0 flex-1 justify-center overflow-auto rounded-lg border border-ui-hairline bg-ui-recessed">
          {origin && (
            <iframe
              key={`${src}:${attempt}:${stepId}`}
              ref={frame}
              src={src}
              title="Service journey preview"
              onLoad={send}
              sandbox="allow-scripts allow-same-origin"
              className={`h-full border-0 bg-white ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
            />
          )}
          {(!origin || (!connected && timedOut)) && (
            <div className="absolute inset-0 grid place-items-center bg-ui-base p-6 text-center">
              <div>
                <p className="font-medium">Preview unavailable</p>
                <p className="mt-2 text-sm text-ui-subtle">
                  The {page ? "content" : "form"} preview could not be reached.
                  Your draft is safe.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setAttempt((v) => v + 1);
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
