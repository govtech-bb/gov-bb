import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  FileTextIcon,
  ListChecksIcon,
  EnvelopeSimpleIcon,
  CheckCircleIcon,
  LinkIcon,
  ArrowsSplitIcon,
  RepeatIcon,
} from "@phosphor-icons/react";
import type { ServiceSnapshot, Primitive } from "@govtech-bb/form-types";
import { hydrateForm } from "@govtech-bb/form-builder";
import { submissionActionSummary } from "../../lib/submission-actions";
import { isRequiredStep } from "../builder/recipe-reducer";
import { getCatalogFn } from "../../server/registry";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
import { Banner } from "../ui/banner";
import { Flow } from "../ui/flow";
import { Tabs } from "../ui/tabs";
import { Dialog } from "../ui/dialog";
import { Collapsible } from "../ui/collapsible";
import { AppLink } from "../app-link";
import type { ServiceState } from "./service-state";
import { servicePageLabel } from "./service-model";

export interface JourneyNode {
  id: string;
  title: string;
  kind:
    | "content"
    | "redirect"
    | "form"
    | "question"
    | "condition"
    | "end"
    | "confirmation"
    | "delivery";
  publicPath?: string;
  pageKind?: string;
  path?: string;
  stepId?: string;
  description?: string;
  actionType?: string;
  conditions?: { question: string; comparison: string; answer?: string }[];
}
export interface JourneyEdge {
  from: string;
  to: string;
  label: string;
  kind: "navigation" | "conditional" | "delivery";
  branch?: "yes" | "no";
}

export function serviceJourney(
  snapshot: ServiceSnapshot,
  expandForm: boolean,
  labels: Record<string, string> = {},
  fields: Record<string, Pick<Primitive, "options">> = {},
) {
  const { manifest, pages, recipe } = snapshot;
  const nodes: JourneyNode[] = manifest.pages.map((p) => ({
    id: p.id,
    title: p.title,
    kind: pages.find((page) => page.id === p.id)?.frontmatter.redirect_to
      ? "redirect"
      : "content",
    path: p.path,
    publicPath: p.publicPath,
    pageKind: p.kind,
  }));
  nodes.sort(
    (a, b) =>
      Number(b.id === manifest.entryPoint) -
      Number(a.id === manifest.entryPoint),
  );
  const edges: JourneyEdge[] = [];
  const broken: string[] = [];
  if (recipe) {
    nodes.push({ id: "form", title: recipe.title, kind: "form" });
    if (expandForm) {
      const checks = recipe.steps.map((step) =>
        (step.behaviours ?? []).filter((b) => b.type === "stepConditionalOn"),
      );
      const entry = (index: number) => {
        const step = recipe.steps[index];
        return step
          ? `${checks[index].length ? "condition" : "step"}:${step.stepId}`
          : "form:end";
      };
      if (recipe.steps.length)
        edges.push({
          from: "form",
          to: entry(0),
          kind: "navigation",
          label: "Start form",
        });
      recipe.steps.forEach((step, index) => {
        const id = `step:${step.stepId}`;
        if (checks[index].length) {
          nodes.push({
            id: entry(index),
            kind: "condition",
            title: `Condition for ${step.title || step.stepId}`,
            stepId: step.stepId,
            conditions: checks[index].map((check) => {
              const key = `${check.targetStepId}.${check.targetFieldId}`;
              const question = labels[key] ?? check.targetFieldId;
              const transform =
                check.transform &&
                {
                  yearsSince: "Years since",
                  monthsSince: "Months since",
                  daysSince: "Days since",
                  daysUntil: "Days until",
                }[check.transform];
              const answer = (value: string | number | boolean) =>
                fields[key]?.options?.find(
                  (option) => option.value === String(value),
                )?.label ??
                (typeof value === "boolean"
                  ? value
                    ? "Yes"
                    : "No"
                  : String(value));
              return {
                question: transform ? `${transform} ${question}` : question,
                comparison: {
                  equal: "is",
                  notEqual: "is not",
                  in: "includes any of",
                  exists: "has an answer",
                  gte: "is at least",
                  lte: "is at most",
                  gt: "is greater than",
                  lt: "is less than",
                }[check.operator],
                answer:
                  check.operator === "exists"
                    ? undefined
                    : Array.isArray(check.value)
                      ? check.value.map(answer).join(" or ")
                      : answer(check.value),
              };
            }),
          });
          // All checks must pass; otherwise continue to the next page's own check.
          edges.push(
            {
              from: entry(index),
              to: id,
              kind: "conditional",
              label: "Yes",
              branch: "yes",
            },
            {
              from: entry(index),
              to: entry(index + 1),
              kind: "conditional",
              label: "No",
              branch: "no",
            },
          );
        }
        nodes.push({
          id,
          stepId: step.stepId,
          title: step.title || step.stepId,
          kind:
            step.stepId === "submission-confirmation"
              ? "confirmation"
              : "question",
        });
        if (index < recipe.steps.length - 1 || checks[index].length)
          edges.push({
            from: id,
            to: entry(index + 1),
            kind: "navigation",
            label: "Continue",
          });
        if (step.behaviours?.some((b) => b.type === "repeatable"))
          edges.push({
            from: id,
            to: id,
            kind: "conditional",
            label: "Add another response",
          });
      });
      if (checks.at(-1)?.length)
        nodes.push({ id: "form:end", title: "End of form", kind: "end" });
    }
    const confirmation = recipe.steps.find(
      (s) => s.stepId === "submission-confirmation",
    );
    if (!expandForm && confirmation) {
      nodes.push({
        id: "step:submission-confirmation",
        stepId: confirmation.stepId,
        title: confirmation.title || "Confirmation page",
        kind: "confirmation",
      });
      edges.push({
        from: "form",
        to: "step:submission-confirmation",
        label: "Shown after submitting",
        kind: "navigation",
      });
    }
    [
      ...(recipe.processors ?? []),
      ...(snapshot.pendingConfig.processors ?? []),
    ].forEach((p, i) => {
      const id = `action:${i}`;
      nodes.push({
        id,
        ...submissionActionSummary(p, labels, manifest.contactDetails?.email),
        kind: "delivery",
        actionType: p.type,
      });
      edges.push({
        from:
          expandForm &&
          recipe.steps.some((s) => s.stepId !== "submission-confirmation")
            ? `step:${recipe.steps.filter((s) => s.stepId !== "submission-confirmation").at(-1)!.stepId}`
            : "form",
        to: id,
        kind: "delivery",
        label: p.type === "payment" ? "Payment required" : "On submit",
      });
    });
  }
  for (const page of pages) {
    const source = manifest.pages.find((p) => p.id === page.id)!;
    const redirect =
      typeof page.frontmatter.redirect_to === "string"
        ? page.frontmatter.redirect_to
        : null;
    const links = redirect
      ? [redirect]
      : [
          ...page.body.matchAll(
            /\]\(([^\s)]+)(?:\s+[^)]*)?\)|<a\b[^>]*href=["']([^"']+)["'][^>]*>/g,
          ),
        ].map((m) => m[1] ?? m[2]);
    for (const href of links) {
      if (/^(mailto:|tel:|#)/i.test(href)) continue;
      let target: string;
      try {
        target = new URL(
          href,
          `https://preview.invalid${source.publicPath}`,
        ).pathname.replace(/\/$/, "");
      } catch {
        broken.push(`${source.title}: ${href}`);
        continue;
      }
      const pageTarget = manifest.pages.find(
        (p) => p.publicPath.replace(/\/$/, "") === target,
      );
      if (pageTarget)
        edges.push({
          from: page.id,
          to: pageTarget.id,
          kind: "navigation",
          label:
            page.frontmatter.redirect_to === href
              ? `Redirect to ${pageTarget.title}`
              : "Page link",
        });
      else if (manifest.formId && target === `/forms/${manifest.formId}`)
        edges.push({
          from: page.id,
          to: "form",
          kind: "navigation",
          label: "Start application",
        });
      else if (
        !/^https?:/i.test(href) &&
        target.startsWith(source.publicPath.replace(/\/[^/]*$/, "") + "/")
      )
        broken.push(`${source.title}: ${href}`);
    }
    if (
      !redirect &&
      recipe &&
      /<a\b(?![^>]*href=)[^>]*data-start-link/.test(page.body)
    )
      edges.push({
        from: page.id,
        to: "form",
        kind: "navigation",
        label: "Start application",
      });
  }
  return {
    nodes,
    edges: edges.filter(
      (edge, i, all) =>
        all.findIndex(
          (e) =>
            e.from === edge.from && e.to === edge.to && e.kind === edge.kind,
        ) === i,
    ),
    broken,
  };
}

export function addJourneyLink(
  snapshot: ServiceSnapshot,
  from: string,
  to: string,
  label: string,
): ServiceSnapshot {
  const source = snapshot.pages.find((p) => p.id === from);
  const target = snapshot.manifest.pages.find((p) => p.id === to);
  if (!source || (!target && !(to === "form" && snapshot.recipe)))
    throw new Error("Choose pages belonging to this service");
  if (from === to) throw new Error("Choose a different destination page");
  if (source.frontmatter.redirect_to)
    throw new Error("Add links to the destination page instead of a redirect");
  if (
    serviceJourney(snapshot, false).edges.some(
      (edge) => edge.from === from && edge.to === to,
    )
  )
    throw new Error("This page already links to that destination");
  const text = label.trim().replace(/[\\[\]]/g, "\\$&");
  if (!text) throw new Error("Give the link a label");
  const link = target
    ? `[${text}](${target.publicPath})`
    : `<a data-start-link>${text.replace(/[<>&]/g, "")}</a>`;
  return {
    ...snapshot,
    pages: snapshot.pages.map((p) =>
      p.id === from ? { ...p, body: `${p.body.trimEnd()}\n\n${link}\n` } : p,
    ),
  };
}

/** Redirect URLs are shortcuts into the journey, not pages people stop on. */
export function journeyMap(graph: ReturnType<typeof serviceJourney>) {
  const nodes = graph.nodes.filter((node) => node.kind !== "redirect");
  const visible = new Set(nodes.map((node) => node.id));
  const edges: JourneyEdge[] = [];
  for (const edge of graph.edges) {
    if (!visible.has(edge.from)) continue;
    let target: string | undefined = edge.to;
    const visited = new Set<string>();
    while (target && !visible.has(target) && !visited.has(target)) {
      visited.add(target);
      target = graph.edges.find((next) => next.from === target)?.to;
    }
    if (!target || !visible.has(target) || target === edge.from) continue;
    if (
      !edges.some(
        (next) =>
          next.from === edge.from &&
          next.to === target &&
          next.kind === edge.kind,
      )
    )
      edges.push({ ...edge, to: target });
  }
  return { nodes, edges };
}

export function ServiceJourney({
  snapshot,
  workspace,
}: {
  snapshot: ServiceSnapshot;
  workspace: ServiceState;
}) {
  const storageKey = `service-journey:${snapshot.manifest.serviceId}`;
  const [{ view, selectedId }, setNavigation] = useState({
    view: "map",
    selectedId: snapshot.manifest.entryPoint,
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (
        saved &&
        ["map", "form", "list"].includes(saved.view) &&
        (saved.selectedId === null || typeof saved.selectedId === "string")
      )
        setNavigation({ view: saved.view, selectedId: saved.selectedId });
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }, [storageKey]);
  const remember = (next: { view: string; selectedId: string | null }) => {
    setNavigation(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Only the return position is lost when storage is unavailable.
    }
  };
  const setView = (next: string) => remember({ view: next, selectedId });
  const setSelectedId = (next: string) => remember({ view, selectedId: next });
  const [fields, setFields] = useState<Record<string, Primitive>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkError, setLinkError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const panelId = useId();
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (selectedId)
        nodeButtons.current.get(selectedId)?.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, view]);
  const { manifest, recipe } = snapshot;
  useEffect(() => {
    if (!recipe) return;
    let active = true;
    getCatalogFn()
      .then((catalog) => {
        if (!active) return;
        setFields(
          Object.fromEntries(
            hydrateForm(
              {
                ...recipe,
                createdAt: recipe.createdAt ?? new Date().toISOString(),
                updatedAt: recipe.updatedAt ?? new Date().toISOString(),
              },
              catalog,
            ).steps.flatMap((step) =>
              step.elements.map((field) => [
                `${step.stepId}.${field.fieldId}`,
                field,
              ]),
            ),
          ),
        );
      })
      .catch(() => {
        if (active)
          setError(
            "Question labels could not be loaded. The form still shows its saved pages and links.",
          );
      });
    return () => {
      active = false;
    };
  }, [recipe]);
  const labels = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.label]),
  );
  const graph = serviceJourney(snapshot, view !== "map", labels, fields);
  const map = journeyMap(graph);
  const nodes =
    view === "form"
      ? map.nodes.filter((node) =>
          ["question", "condition", "confirmation", "end"].includes(node.kind),
        )
      : map.nodes;
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = map.edges.filter(
    (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
  );
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const redirects = graph.nodes.filter((node) => node.kind === "redirect");
  const contentPages = graph.nodes.filter((node) => node.kind === "content");
  const caption = (node: JourneyNode) =>
    node.id === manifest.entryPoint
      ? "Start here"
      : {
          content:
            node.pageKind === "start"
              ? "Start page"
              : node.pageKind === "main"
                ? "Main page"
                : "Guidance page",
          redirect: "Redirect",
          form: "Application",
          question: "Form page",
          condition: "If / Else",
          end: "End",
          confirmation: "After submitting",
          delivery: "After submitting",
        }[node.kind];
  const title = (node: JourneyNode) =>
    node.kind === "form"
      ? "Application form"
      : node.kind === "content"
        ? servicePageLabel({
            path: node.path ?? "",
            title: node.title,
            kind: node.pageKind,
          })
        : node.title;
  const description = (node: JourneyNode) =>
    node.publicPath ??
    (node.kind === "form"
      ? `${recipe?.steps.length ?? 0} pages · View questions and routing`
      : node.description);
  const editLink = (node: JourneyNode) => (
    <AppLink
      variant="outline"
      size="sm"
      to={
        node.path
          ? "/content/edit"
          : node.kind === "delivery"
            ? "/services"
            : "/builder"
      }
      search={
        node.path
          ? { path: node.path, service: manifest.serviceId }
          : node.kind === "delivery"
            ? { service: manifest.serviceId, tab: "delivery" }
            : {
                formId: manifest.formId ?? undefined,
                service: manifest.serviceId,
                ...(node.stepId ? { step: node.stepId } : {}),
                ...(node.kind === "condition"
                  ? { focus: "logic" as const }
                  : {}),
              }
      }
    >
      {node.path
        ? "Edit page"
        : node.kind === "delivery"
          ? "Edit settings"
          : node.kind === "condition"
            ? "Edit condition"
            : node.kind === "form" || node.kind === "end"
              ? "Edit form"
              : "Edit page"}
    </AppLink>
  );
  const openLink = (source?: string) => {
    setFrom(source ?? contentPages[0]?.id ?? "");
    setTo("");
    setLinkLabel("");
    setLinkError("");
    setSaved(false);
    setLinkOpen(true);
  };
  const move = async (stepId: string, direction: -1 | 1) => {
    if (!recipe) return;
    const index = recipe.steps.findIndex((step) => step.stepId === stepId);
    const next = index + direction;
    if (
      index < 0 ||
      next < 0 ||
      next >= recipe.steps.length ||
      isRequiredStep(stepId) ||
      isRequiredStep(recipe.steps[next].stepId)
    )
      return;
    const steps = [...recipe.steps];
    [steps[index], steps[next]] = [steps[next], steps[index]];
    try {
      if (
        !(await workspace.save({ ...snapshot, recipe: { ...recipe, steps } }))
      )
        setError("Could not change the page order. Try again.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change the page order. Try again.",
      );
    }
  };
  const conditionRows = (node: JourneyNode) => (
    <span className="block space-y-2 text-sm font-normal leading-relaxed">
      {node.conditions?.map((check, index) => (
        <span
          key={index}
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1"
        >
          <span className="text-ui-subtle">{index ? "and" : "If"}</span>
          <span className="rounded bg-ui-recessed px-1.5 py-0.5 font-medium text-ui-default">
            {check.question}
          </span>
          <span className="text-ui-subtle">{check.comparison}</span>
          {check.answer !== undefined && (
            <span className="rounded bg-ui-recessed px-1.5 py-0.5 font-medium text-ui-default">
              {check.answer || "an empty value"}
            </span>
          )}
        </span>
      ))}
    </span>
  );
  const renderNode = (node: JourneyNode) => {
    const Icon =
      node.kind === "condition"
        ? ArrowsSplitIcon
        : node.kind === "form"
          ? ListChecksIcon
          : node.kind === "confirmation"
            ? CheckCircleIcon
            : node.actionType === "email"
              ? EnvelopeSimpleIcon
              : FileTextIcon;
    const behaviours = recipe?.steps.find(
      (step) => step.stepId === node.stepId,
    )?.behaviours;
    return (
      <Flow.Node
        key={node.id}
        id={node.id}
        render={
          <li
            className={`${node.kind === "condition" ? "w-80" : "w-64"} overflow-hidden rounded-xl border bg-ui-base ${selected?.id === node.id ? "border-ui-brand" : "border-ui-line"}`}
          />
        }
      >
        <Button
          ref={(button) => {
            if (button) nodeButtons.current.set(node.id, button);
            else nodeButtons.current.delete(node.id);
          }}
          variant="ghost"
          className="h-auto w-full justify-start rounded-none p-4 text-left whitespace-normal text-ui-default focus-visible:-outline-offset-2!"
          aria-label={`View ${title(node)}${node.publicPath ? `, ${node.publicPath}` : ""}`}
          aria-pressed={selected?.id === node.id}
          onClick={() => setSelectedId(node.id)}
        >
          <span className="block min-w-0 flex-1">
            <span className="mb-3 flex items-center gap-2 text-xs text-ui-subtle">
              <Icon aria-hidden="true" />
              {caption(node)}
            </span>
            {node.conditions ? (
              conditionRows(node)
            ) : (
              <span className="block text-base font-semibold leading-snug text-ui-strong">
                {title(node)}
              </span>
            )}
            {description(node) && (
              <span
                className={`mt-2 block text-xs font-normal leading-relaxed text-ui-subtle ${node.publicPath ? "truncate" : ""}`}
                title={description(node)}
              >
                {description(node)}
              </span>
            )}
            {node.kind === "question" &&
              behaviours?.some(
                (behaviour) => behaviour.type === "repeatable",
              ) && (
                <span className="mt-3 inline-flex items-center gap-1 text-xs">
                  <RepeatIcon aria-hidden="true" />
                  Repeatable
                </span>
              )}
          </span>
        </Button>
        {selected?.id === node.id && (
          <div className="border-t border-ui-hairline px-4 py-3">
            {editLink(node)}
          </div>
        )}
      </Flow.Node>
    );
  };
  const outgoingLinks = (node: JourneyNode) =>
    graph.edges.filter((edge) => edge.from === node.id);
  return (
    <section aria-label="Service journey" className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Journey map</h2>
        <p className="mt-2 text-sm text-ui-subtle">
          See how people move through this service. Select a page to see its
          links or edit it.
        </p>
      </div>
      {error && <Banner variant="alert">{error}</Banner>}
      {graph.broken.length > 0 && (
        <Banner variant="alert">
          <p className="font-medium">Check these page links</p>
          <ul className="mt-2 list-inside list-disc">
            {graph.broken.map((link) => (
              <li key={link}>{link}</li>
            ))}
          </ul>
        </Banner>
      )}
      <div className="min-w-0 overflow-hidden rounded-xl border border-ui-hairline bg-ui-base">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-hairline p-3">
          <Tabs
            aria-label="Journey view"
            value={view}
            onValueChange={setView}
            tabs={[
              {
                value: "map",
                label: "Service map",
                id: `${panelId}-map`,
                "aria-controls": panelId,
              },
              {
                value: "form",
                label: "Form pages",
                disabled: !recipe?.steps.length,
                id: `${panelId}-form`,
                "aria-controls": panelId,
              },
              {
                value: "list",
                label: "List",
                id: `${panelId}-list`,
                "aria-controls": panelId,
              },
            ]}
          />
          {!!contentPages.length && (
            <Button
              size="sm"
              variant="outline"
              icon={<LinkIcon />}
              onClick={() => openLink()}
            >
              Add page link
            </Button>
          )}
        </div>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-${view}`}
        >
          {!nodes.length ? (
            <p className="p-8 text-sm text-ui-subtle">
              Add a content page or application form to start this journey.
            </p>
          ) : view === "list" ? (
            <ol className="divide-y divide-ui-hairline">
              {nodes.map((node) => (
                <li key={node.id} className="p-4 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {title(node)}{" "}
                        <span className="ml-2 text-xs font-normal text-ui-subtle">
                          {caption(node)}
                        </span>
                      </p>
                      {description(node) && (
                        <p className="mt-1 break-words text-sm text-ui-subtle">
                          {description(node)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {node.kind === "question" &&
                        node.stepId &&
                        !isRequiredStep(node.stepId) &&
                        [-1, 1].map((direction) => {
                          const index = recipe!.steps.findIndex(
                            (step) => step.stepId === node.stepId,
                          );
                          const adjacent = recipe!.steps[index + direction];
                          return (
                            <Button
                              key={direction}
                              size="sm"
                              variant="ghost"
                              shape="square"
                              title={`Move ${node.title} ${direction < 0 ? "earlier" : "later"}`}
                              aria-label={`Move ${node.title} ${direction < 0 ? "earlier" : "later"}`}
                              disabled={
                                workspace.saving ||
                                !adjacent ||
                                isRequiredStep(adjacent.stepId)
                              }
                              onClick={() =>
                                void move(node.stepId!, direction as -1 | 1)
                              }
                            >
                              {direction < 0 ? (
                                <ArrowUpIcon />
                              ) : (
                                <ArrowDownIcon />
                              )}
                            </Button>
                          );
                        })}
                      {editLink(node)}
                    </div>
                  </div>
                  {node.conditions && (
                    <div className="mt-3">{conditionRows(node)}</div>
                  )}
                  {!!outgoingLinks(node).length && (
                    <ul className="mt-3 space-y-2 text-sm text-ui-subtle">
                      {outgoingLinks(node).map((edge, i) => (
                        <li key={i} className="flex gap-2">
                          <ArrowRightIcon
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0"
                          />
                          <span>
                            {edge.label} ·{" "}
                            {title(
                              graph.nodes.find(
                                (target) => target.id === edge.to,
                              ) ?? node,
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="h-[min(36rem,60dvh)] min-h-80 bg-ui-elevated [background-image:radial-gradient(var(--color-ui-hairline)_1px,transparent_1px)] [background-size:22px_22px]">
              <Flow
                key={view}
                connections={edges}
                orientation={view === "form" ? "vertical" : "horizontal"}
                align="center"
                padding={{ x: 72, y: 64 }}
                controls
                className="h-full"
              >
                {nodes.map(renderNode)}
              </Flow>
            </div>
          )}
        </div>
        {selected && view !== "list" && (
          <div
            className="border-t border-ui-hairline p-4 sm:p-5"
            aria-label="Selected page details"
            role="region"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{title(selected)}</h3>
                {description(selected) && (
                  <p className="mt-1 break-words text-sm text-ui-subtle">
                    {description(selected)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.kind === "form" && (
                  <Button size="sm" onClick={() => setView("form")}>
                    View form pages
                  </Button>
                )}
                {selected.kind === "content" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<LinkIcon />}
                    onClick={() => openLink(selected.id)}
                  >
                    Add link
                  </Button>
                )}
              </div>
            </div>
            {selected.conditions && (
              <div className="mt-3">{conditionRows(selected)}</div>
            )}
            {outgoingLinks(selected).length ? (
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {outgoingLinks(selected).map((edge, i) => {
                  const target = graph.nodes.find(
                    (node) => node.id === edge.to,
                  );
                  return (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-4 text-ui-subtle"
                      />
                      <span className="text-ui-subtle">{edge.label}</span>
                      {target?.kind === "redirect" ? (
                        <>
                          <span className="break-all">
                            {target.publicPath} (redirect)
                          </span>
                          {editLink(target)}
                        </>
                      ) : (
                        target && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-auto max-w-full justify-start py-1 text-left whitespace-normal"
                            onClick={() => {
                              setSelectedId(target.id);
                              const button = nodeButtons.current.get(target.id);
                              button?.focus({ preventScroll: true });
                              button?.scrollIntoView({
                                block: "nearest",
                                inline: "nearest",
                              });
                            }}
                          >
                            {title(target)}
                          </Button>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : selected.kind === "content" ? (
              <p className="mt-3 text-sm text-ui-subtle">
                This page has no links to another page in this service.
              </p>
            ) : null}
            {saved && (
              <p role="status" className="mt-3 text-sm text-ui-subtle">
                Page link saved.
              </p>
            )}
          </div>
        )}
      </div>
      {!!redirects.length && (
        <Collapsible className="rounded-lg border border-ui-hairline bg-ui-base px-4 py-3">
          <Collapsible.DefaultTrigger>
            Redirects ({redirects.length})
          </Collapsible.DefaultTrigger>
          <Collapsible.Panel>
            <p className="mt-3 text-sm text-ui-subtle">
              These URLs send visitors to another page. They are kept outside
              the main map.
            </p>
            <ul className="mt-3 divide-y divide-ui-hairline">
              {redirects.map((redirect) => (
                <li
                  key={redirect.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {redirect.publicPath}
                    </p>
                    <p className="mt-1 break-words text-sm text-ui-subtle">
                      Goes to{" "}
                      {String(
                        snapshot.pages.find((page) => page.id === redirect.id)
                          ?.frontmatter.redirect_to ?? "",
                      )}
                    </p>
                  </div>
                  {editLink(redirect)}
                </li>
              ))}
            </ul>
          </Collapsible.Panel>
        </Collapsible>
      )}
      <Dialog.Root
        open={linkOpen}
        onOpenChange={(open) => {
          if (!workspace.saving) setLinkOpen(open);
        }}
      >
        <Dialog size="lg">
          <Dialog.Title>Add a page link</Dialog.Title>
          <Dialog.Description className="mt-2">
            Add a link to the bottom of a content page. You can change its
            wording or position in the page editor.
          </Dialog.Description>
          <form
            className="mt-5 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setLinkError("");
              try {
                const result = await workspace.save(
                  addJourneyLink(snapshot, from, to, linkLabel),
                );
                if (!result) {
                  setLinkError("Could not save the link. Try again.");
                  return;
                }
                setSelectedId(from);
                setSaved(true);
                setLinkOpen(false);
              } catch (cause) {
                setLinkError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not add the link",
                );
              }
            }}
          >
            {linkError && (
              <Banner variant="alert" role="alert">
                {linkError}
              </Banner>
            )}
            <Select
              label="From page"
              value={from}
              onValueChange={(value) => {
                setFrom(String(value));
                setTo("");
                setLinkLabel("");
              }}
              items={contentPages.map((node) => ({
                value: node.id,
                label: `${node.title} · ${node.publicPath}`,
              }))}
            />
            <Select
              label="Link to"
              value={to}
              onValueChange={(value) => {
                const id = String(value);
                setTo(id);
                setLinkLabel(
                  id === "form"
                    ? "Start now"
                    : (contentPages.find((node) => node.id === id)?.title ??
                        ""),
                );
              }}
              items={[
                { value: "", label: "Choose a page" },
                ...contentPages
                  .filter((node) => node.id !== from)
                  .map((node) => ({
                    value: node.id,
                    label: `${node.title} · ${node.publicPath}`,
                  })),
                ...(recipe
                  ? [{ value: "form", label: "Application form" }]
                  : []),
              ]}
            />
            <Input
              label="Link text"
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              placeholder="For example, Help with your application"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                disabled={workspace.saving}
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={workspace.saving}
                disabled={!from || !to || !linkLabel.trim()}
              >
                Save link
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </section>
  );
}
