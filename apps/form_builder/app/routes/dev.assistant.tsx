import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { aiContentPatchSchema } from "@govtech-bb/form-builder";
import { serviceSnapshotSchema } from "@govtech-bb/form-types";
import {
  AiMagicIcon,
  ArrowReloadHorizontalIcon,
  Moon02Icon,
  Sun03Icon,
} from "hugeicons-react";
import { Assistant } from "../components/ui/ai/assistant";
import type { AssistantRequest } from "../components/ui/ai/prompt-bar";
import { SelectionActions } from "../components/ui/ai/selection-actions";
import { TaskRows } from "../components/ui/ai/task-rows";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { InputArea } from "../components/ui/input/input-area";
import { useTheme } from "../hooks/use-theme";
import { streamDemo } from "../server/ai-builder/demo";

export const Route = createFileRoute("/dev/assistant")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Assistant demo · Form builder" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssistantDemo,
});

const initialPage = {
  title: "Apply for a library card",
  description: "Information about becoming a library member.",
  body: "Persons desirous of obtaining membership of the National Library Service are required to present themselves at their nearest branch with documentary evidence of identity and residential address. Applicants shall complete the prescribed registration form prior to issuance of a membership card.",
};
const pageId = "11111111-1111-4111-8111-111111111111";
const pagePath = "apps/landing/src/content/assistant-demo/index.md";
const examples = [
  ["Simplify the page", "Make this page easier to understand"],
  ["Add a checklist", "Add a checklist of what to bring"],
  ["Try a warning", "Show me a validation warning"],
  ["Ask me questions", "Ask me questions about this page"],
  ["Show code", "Show me a code example"],
] as const;

function TaskExample() {
  const [phase, setPhase] = useState<
    "idle" | "reading" | "error" | "retrying" | "done"
  >("idle");
  useEffect(() => {
    if (phase !== "reading" && phase !== "retrying") return;
    const timer = setTimeout(
      () => setPhase(phase === "reading" ? "error" : "done"),
      800,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  return (
    <div className="pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-ui-subtle">
          Scripted task progress with a retryable error.
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={phase === "reading" || phase === "retrying"}
          onClick={() => setPhase("reading")}
        >
          Run tasks
        </Button>
      </div>
      <TaskRows
        rows={[
          {
            id: "read",
            label: "Read sample document",
            status:
              phase === "idle"
                ? "pending"
                : phase === "reading"
                  ? "running"
                  : "done",
            detail:
              "This local demo simulates reading a document; no file is uploaded.",
          },
          {
            id: "check",
            label: "Check sample details",
            status:
              phase === "error"
                ? "error"
                : phase === "retrying"
                  ? "running"
                  : phase === "done"
                    ? "done"
                    : "pending",
            detail:
              phase === "error"
                ? "The first check intentionally fails. Retry to complete the demo."
                : phase === "done"
                  ? "The retry completed successfully."
                  : "Check the sample details after reading the document.",
            ...(phase === "error"
              ? { onRetry: () => setPhase("retrying") }
              : {}),
          },
        ]}
      />
    </div>
  );
}

function AssistantDemo() {
  const { theme, toggleTheme } = useTheme();
  const [page, setPage] = useState(initialPage);
  const [open, setOpen] = useState(true);
  const [harness, setHarness] = useState(false);
  const [session, setSession] = useState("initial");
  const [request, setRequest] = useState<AssistantRequest>();
  const [applied, setApplied] = useState(0);
  const editor = useRef<HTMLDivElement>(null);
  const snapshot = serviceSnapshotSchema.parse({
    manifest: {
      schemaVersion: 1,
      serviceId: "assistant-demo",
      title: "Library card · Demo",
      category: "education",
      formId: null,
      entryPoint: pageId,
      pages: [
        {
          id: pageId,
          path: pagePath,
          title: page.title,
          kind: "main",
          publicPath: "/education/assistant-demo",
        },
      ],
    },
    pages: [
      {
        id: pageId,
        path: pagePath,
        frontmatter: {
          title: page.title,
          description: page.description,
          category: "education",
          visibility: "draft",
        },
        body: page.body,
        baseSha: null,
      },
    ],
    recipe: null,
    pendingConfig: { mdaContactId: null, processors: null },
  });
  return (
    <main
      data-ui="govtech"
      data-mode={theme}
      className="@container flex h-dvh min-h-0 overflow-hidden bg-ui-canvas font-sans text-ui-default"
    >
      <section
        hidden={harness && open}
        className="min-w-0 flex-1 overflow-y-auto"
      >
        <header className="flex items-center justify-between gap-3 px-6 py-4 text-[12px] sm:px-8">
          <span className="font-medium">GovTech Barbados</span>
          <div className="flex items-center gap-2">
            <span className="text-ui-subtle">Local demo</span>
            <Button
              variant="ghost"
              shape="square"
              aria-label={
                theme === "light" ? "Dark appearance" : "Light appearance"
              }
              onClick={toggleTheme}
              icon={theme === "light" ? <Moon02Icon /> : <Sun03Icon />}
            />
          </div>
        </header>
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8 sm:px-8">
          <div className="space-y-3">
            <h1 className="text-[26px] leading-tight font-normal tracking-tight">
              Try your service assistant
            </h1>
            <p className="max-w-prose text-[13px] leading-6 text-ui-subtle">
              This sample library page uses scripted replies. Edits change only
              this demo; no AI account or publishing is involved.
            </p>
          </div>
          <div className="space-y-3">
            <h2 className="text-[13px] font-medium">
              Start with a sample request
            </h2>
            <p className="text-[12px] leading-5 text-ui-subtle">
              Choose an example, then press Send. Use Ask to review the change,
              or switch to Auto to apply it after validation. Expand the
              assistant to see Preview and Changes.
            </p>
            <div className="-ms-2 flex flex-wrap gap-1">
              {examples.map(([label, prompt]) => (
                <Button
                  key={label}
                  variant="ghost"
                  size="sm"
                  className="text-[12px] font-normal"
                  onClick={() => {
                    setOpen(true);
                    setRequest({
                      id: crypto.randomUUID(),
                      prompt,
                      selection: "",
                    });
                  }}
                >
                  <AiMagicIcon size={15} aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-5 border-t border-ui-hairline pt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium">Sample page draft</h2>
              <span role="status" className="text-[11px] text-ui-subtle">
                {applied
                  ? `${applied} ${applied === 1 ? "change" : "changes"} applied`
                  : "Ready to edit"}
              </span>
            </div>
            <Input
              label="Page title"
              value={page.title}
              onChange={(event) =>
                setPage({ ...page, title: event.target.value })
              }
            />
            <Input
              label="Page description"
              value={page.description}
              onChange={(event) =>
                setPage({ ...page, description: event.target.value })
              }
            />
            <div ref={editor}>
              <InputArea
                label="Page content"
                description="Select text to try Explain, Improve, or a custom edit."
                rows={8}
                value={page.body}
                onChange={(event) =>
                  setPage({ ...page, body: event.target.value })
                }
              />
              <SelectionActions
                target={editor}
                value={page.body}
                onAction={(next) => {
                  setRequest(next);
                  setOpen(true);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ui-subtle">
                Fictional content for testing, not official service guidance.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPage(initialPage);
                  setApplied(0);
                  setRequest(undefined);
                  setSession(crypto.randomUUID());
                }}
              >
                <ArrowReloadHorizontalIcon size={15} aria-hidden="true" />
                Reset demo
              </Button>
            </div>
          </div>
          <details className="border-t border-ui-hairline pt-4">
            <summary className="cursor-pointer text-[12px] text-ui-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-focus">
              Component examples
            </summary>
            <TaskExample key={session} />
          </details>
          {!open && (
            <Button onClick={() => setOpen(true)}>
              <AiMagicIcon size={17} aria-hidden="true" />
              Open assistant
            </Button>
          )}
        </div>
      </section>
      <Assistant
        key={session}
        user="assistant-demo"
        conversationScope={`demo-${session}`}
        kind="content"
        documentId={pagePath}
        document={page}
        revisionSource={page}
        open={open}
        onOpenChange={setOpen}
        harness={harness}
        onHarnessChange={setHarness}
        artifact={{ snapshot, pageId }}
        transport={streamDemo}
        request={request}
        onRequestHandled={() => setRequest(undefined)}
        prepare={async (proposal) => {
          const patch = aiContentPatchSchema.parse(proposal.patch);
          const after = {
            title: patch.title ?? page.title,
            description: patch.description ?? page.description,
            body: patch.body ?? page.body,
          };
          await new Promise((resolve) => setTimeout(resolve, 900));
          return {
            before: page,
            after,
            warnings: after.body.includes("[Confirm")
              ? ["Confirm the opening hours before using this guidance."]
              : [],
            appliedMessage:
              "Applied to the sample page. This demo does not save or publish a service.",
            apply: () => {
              setPage(after);
              setApplied((count) => count + 1);
            },
          };
        }}
      />
    </main>
  );
}
