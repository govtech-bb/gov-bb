import { getServiceGitHistory, type ServiceGitCommit } from "../../server/services";
import { useEffect, useState } from "react";
import type { ServiceCheckpoint, ServiceSnapshot } from "@govtech-bb/form-types";
import {
  retryServiceCheckpoint,
  createServiceCheckpoint,
  getServiceCheckpoint,
  listServiceCheckpoints,
  publishServiceCheckpoint,
  restoreServiceCheckpoint,
  getServicePublication,
} from "../../lib/service-drafts";
import { Button, LinkButton } from "../ui/button";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
import { Field } from "../ui/field";
import { Banner } from "../ui/banner";
import { Collapsible } from "../ui/collapsible";
import { useConfirmation } from "../ui/dialog/confirmation";
import type { ServiceState } from "./service-state";
import { servicePageLabel } from "./service-model";

export function serviceChanges(
  before: ServiceSnapshot,
  after: ServiceSnapshot,
): string[] {
  const changes: string[] = [];
  for (const page of after.pages) {
    const previous = before.pages.find((p) => p.id === page.id);
    if (!previous) changes.push(`Added page: ${page.frontmatter.title}`);
    else if (
      page.body !== previous.body ||
      JSON.stringify(page.frontmatter) !== JSON.stringify(previous.frontmatter)
    )
      changes.push(`Updated page: ${page.frontmatter.title}`);
  }
  for (const page of before.pages)
    if (!after.pages.some((p) => p.id === page.id))
      changes.push(`Removed page: ${page.frontmatter.title}`);
  for (const step of after.recipe?.steps ?? []) {
    const previous = before.recipe?.steps.find((s) => s.stepId === step.stepId);
    if (!previous) changes.push(`Added form page: ${step.title}`);
    else if (JSON.stringify(step) !== JSON.stringify(previous))
      changes.push(`Updated questions or conditions: ${step.title}`);
  }
  for (const step of before.recipe?.steps ?? [])
    if (!after.recipe?.steps.some((s) => s.stepId === step.stepId))
      changes.push(`Removed form page: ${step.title}`);
  if (
    JSON.stringify(before.recipe?.steps.map((s) => s.stepId)) !==
    JSON.stringify(after.recipe?.steps.map((s) => s.stepId))
  )
    changes.push("Changed form page order");
  if (
    JSON.stringify(before.recipe?.processors) !== JSON.stringify(after.recipe?.processors)
  )
    changes.push("Changed delivery actions");
  if (JSON.stringify(before.pendingConfig) !== JSON.stringify(after.pendingConfig))
    changes.push("Changed department or payment settings");
  if (JSON.stringify(before.manifest) !== JSON.stringify(after.manifest))
    changes.push("Changed service details, links, or setup");
  return changes;
}

export function ServiceHistory({ workspace }: { workspace: ServiceState }) {
  const draft = workspace.draft!;
  const [history, setHistory] = useState<ServiceCheckpoint[]>([]);
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<
    (ServiceCheckpoint & { snapshot: ServiceSnapshot }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gitHistory, setGitHistory] = useState<ServiceGitCommit[] | null>(null);
  const [gitPath, setGitPath] = useState(`services/${draft.manifest.serviceId}.json`);
  const [publication, setPublication] = useState("");
  const confirm = useConfirmation();
  const refresh = async () =>
    setHistory(
      await listServiceCheckpoints({
        data: { serviceId: draft.manifest.serviceId },
      }),
    );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [draft.manifest.serviceId]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "History is unavailable");
    } finally {
      try {
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "History could not be refreshed");
      }
      setBusy(false);
    }
  };
  const changes = selected ? serviceChanges(selected.snapshot, draft) : [];
  return (
    <section className="space-y-6" aria-label="Publish">
      <div>
        <h2 className="text-xl font-semibold">Publish</h2>
        <p className="mt-2 text-sm text-ui-subtle">
          Save named versions in Git, compare changes, and restore earlier work. Recent
          version shortcuts are saved in this browser.
        </p>
      </div>
      {error && (
        <Banner variant="error" role="alert">
          {error}
        </Banner>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-64 flex-1" label="Version name">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="For example, ready for content review"
            maxLength={250}
          />
        </Field>
        <Button
          variant="primary"
          disabled={busy || !label.trim()}
          onClick={() =>
            void run(async () => {
              await createServiceCheckpoint({
                data: {
                  serviceId: draft.manifest.serviceId,
                  expectedRevision: draft.revision,
                  label,
                },
              });
              setLabel("");
            })
          }
        >
          {busy ? "Working…" : "Save named version"}
        </Button>
      </div>
      <div className="grid gap-6 @min-[52rem]:grid-cols-[18rem_minmax(0,1fr)]">
        <ol className="space-y-1">
          {history.map((item) => (
            <li key={item.id}>
              <Button
                className="h-auto w-full justify-start py-3 text-left"
                variant="ghost"
                aria-pressed={selected?.id === item.id}
                onClick={() =>
                  void run(async () => {
                    setSelected(
                      await getServiceCheckpoint({
                        data: { serviceId: item.serviceId, id: item.id },
                      }),
                    );
                    setPublication("");
                  })
                }
              >
                <span className="flex flex-col gap-1">
                  <span>{item.label}</span>
                  <span className="text-xs font-normal text-ui-subtle">
                    {item.createdBy} · {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span className="text-xs font-normal text-ui-subtle">
                    {item.gitSha ? "Saved in Git" : "Git checkpoint incomplete"}
                  </span>
                </span>
              </Button>
            </li>
          ))}
          {!history.length && (
            <li className="py-5 text-sm text-ui-subtle">
              Your named versions will appear here.
            </li>
          )}
        </ol>
        {selected && (
          <div className="min-w-0 rounded-lg border border-ui-hairline bg-ui-base p-5">
            <h3 className="font-semibold">Changes since {selected.label}</h3>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm">
              {changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
            {!changes.length && (
              <p className="mt-3 text-sm text-ui-subtle">
                This version matches the current draft.
              </p>
            )}
            {selected.snapshot.pages.map((page) => {
              const current = draft.pages.find((p) => p.id === page.id);
              if (current?.body === page.body) return null;
              return (
                <Collapsible.Root key={page.id} className="mt-4">
                  <Collapsible.DefaultTrigger>
                    {servicePageLabel({
                      path: page.path,
                      title: String(page.frontmatter.title ?? "Page content"),
                    })}
                  </Collapsible.DefaultTrigger>
                  <Collapsible.Panel>
                    <div className="mt-3 grid gap-3 @min-[48rem]:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-xs font-medium text-ui-subtle">
                          Saved version
                        </h4>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ui-recessed p-3 font-sans text-sm">
                          {page.body || "Empty page"}
                        </pre>
                      </div>
                      <div>
                        <h4 className="mb-2 text-xs font-medium text-ui-subtle">
                          Current draft
                        </h4>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ui-recessed p-3 font-sans text-sm">
                          {current?.body || "Page removed"}
                        </pre>
                      </div>
                    </div>
                  </Collapsible.Panel>
                </Collapsible.Root>
              );
            })}
            <Collapsible.Root className="mt-5">
              <Collapsible.DefaultTrigger>
                View version details
              </Collapsible.DefaultTrigger>
              <Collapsible.Panel>
                <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-ui-recessed p-3 text-xs">
                  {JSON.stringify(selected.snapshot, null, 2)}
                </pre>
              </Collapsible.Panel>
            </Collapsible.Root>
            <div className="mt-5 flex flex-wrap gap-2">
              {!selected.gitSha && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const checkpoint = await retryServiceCheckpoint({
                        data: {
                          serviceId: selected.serviceId,
                          id: selected.id,
                        },
                      });
                      setSelected((s) => (s ? { ...s, ...checkpoint } : s));
                    })
                  }
                >
                  Retry saving in Git
                </Button>
              )}
              <Button
                disabled={busy || !changes.length}
                onClick={() =>
                  void run(async () => {
                    if (
                      !(await confirm({
                        title: `Restore ${selected.label}?`,
                        description:
                          "A recovery copy is saved in this browser first. Application questions use the existing draft save; current delivery and payment settings are kept.",
                        confirmLabel: "Restore to draft",
                      }))
                    )
                      return;
                    workspace.setDraft(
                      await restoreServiceCheckpoint({
                        data: {
                          serviceId: selected.serviceId,
                          id: selected.id,
                          expectedRevision: draft.revision,
                        },
                      }),
                    );
                  })
                }
              >
                Restore to draft
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await publishServiceCheckpoint({
                      data: { serviceId: selected.serviceId, id: selected.id },
                    });
                    setSelected((s) => (s ? { ...s, ...result } : s));
                    setPublication(
                      "Pull request opened. Developers can review this version in GitHub.",
                    );
                  })
                }
              >
                {selected.prNumber ? "View publication" : "Open publication PR"}
              </Button>
              {selected.prUrl && (
                <LinkButton
                  href={selected.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub #{selected.prNumber}
                </LinkButton>
              )}
              {selected.prNumber && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await getServicePublication({
                        data: {
                          serviceId: selected.serviceId,
                          id: selected.id,
                        },
                      });
                      setPublication(
                        result.state === "merged"
                          ? "Merged. Deployment has not yet been confirmed."
                          : result.state === "review"
                            ? "Waiting for review in GitHub."
                            : "The publication pull request is closed.",
                      );
                    })
                  }
                >
                  Check publication
                </Button>
              )}
            </div>
            {publication && (
              <p role="status" className="mt-3 text-sm text-ui-subtle">
                {publication}
              </p>
            )}
          </div>
        )}
      </div>
      <Collapsible.Root className="border-t border-ui-hairline pt-5">
        <Collapsible.DefaultTrigger>Earlier changes in Git</Collapsible.DefaultTrigger>
        <Collapsible.Panel>
          <p className="my-3 text-sm text-ui-subtle">
            Browse the latest 25 changes to a service page or application, including
            changes made before this workspace. Open a change to compare it in GitHub.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              className="min-w-64 flex-1"
              label="Page or application"
              value={gitPath}
              onValueChange={(path) => {
                setGitPath(String(path));
                setGitHistory(null);
              }}
              items={[
                {
                  value: `services/${draft.manifest.serviceId}.json`,
                  label: "Service details",
                },
                ...draft.manifest.pages.map((p) => ({
                  value: p.path,
                  label: p.title,
                })),
                ...(draft.recipe
                  ? [
                      {
                        value: `apps/api/src/forms/form-definitions/recipes/${draft.recipe.formId}.json`,
                        label: "Application form",
                      },
                    ]
                  : []),
              ]}
            />
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setGitHistory(
                    await getServiceGitHistory({
                      data: {
                        serviceId: draft.manifest.serviceId,
                        path: gitPath,
                      },
                    }),
                  ),
                )
              }
            >
              Load Git history
            </Button>
          </div>
          {gitHistory && (
            <ol className="mt-4 divide-y divide-ui-hairline">
              {gitHistory.map((commit) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={commit.sha}
                >
                  <div>
                    <p className="font-medium">{commit.message}</p>
                    <p className="mt-1 text-xs text-ui-subtle">
                      {commit.author} · {new Date(commit.date).toLocaleString()}
                    </p>
                  </div>
                  <LinkButton
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                  >
                    View change
                  </LinkButton>
                </li>
              ))}
              {!gitHistory.length && (
                <li className="text-sm text-ui-subtle">
                  This file has no changes on the publication branch yet.
                </li>
              )}
            </ol>
          )}
        </Collapsible.Panel>
      </Collapsible.Root>
    </section>
  );
}
