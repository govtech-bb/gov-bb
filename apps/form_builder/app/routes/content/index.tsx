import { Collapsible } from "../../components/ui/collapsible";
import { ScrollArea } from "../../components/ui/scroll-area";
import { SkeletonLine } from "../../components/ui/loader";
import { Banner } from "../../components/ui/banner";
import { Elevated } from "../../components/ui/surface";
import { Badge } from "../../components/ui/badge";
import { AppLink } from "../../components/app-link";
import { Select } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  GitPullRequestIcon,
  PencilEdit02Icon,
  Moon02Icon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  Sun03Icon,
} from "hugeicons-react";
import { listForms } from "../../server/forms";
import { getPublishBaseBranch } from "../../server/publish";
import {
  CONTENT_ROOT,
  LANDING_CATEGORIES,
  VISIBILITY_WORD,
  linkableForms,
  type ViewLevel,
} from "./-lib";
import type { ContentPageSummary, ContentReviewClaim } from "./-server";
import { useContentList } from "./-use-content-list";
import { ErrorBanner } from "./-modals";
import { usePersistedState } from "./-use-persisted";
import { useTheme } from "./-use-theme";
import { Tip } from "./-sliding-tabs";
import { SectionSwitch } from "../../components/section-switch";
import s from "./-styles.module.css";

export const Route = createFileRoute("/content/")({
  loader: async () => {
    const [forms, baseBranch] = await Promise.all([
      // Hide disabled draft-only / orphan-override rows the picker uses for
      // re-enable (#1658) — they have no live recipe to link content to.
      listForms()
        .then(linkableForms)
        .catch(() => []),
      getPublishBaseBranch().catch(() => "dev"),
    ]);
    return { forms, baseBranch };
  },
  component: ContentHome,
});

const UNCATEGORISED = "__uncat__";
const CATEGORY_TITLE = new Map(
  LANDING_CATEGORIES.map((c) => [c.slug, c.title]),
);
const CATEGORY_ORDER = [
  ...LANDING_CATEGORIES.map((c) => c.slug),
  UNCATEGORISED,
];

function titleCase(slug: string): string {
  const words = slug.replace(/-+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Known categories in IA order, then any others found in the data (e.g. a
 *  freshly merged category the static list doesn't know yet) — so no page can
 *  ever silently vanish from the home. */
function orderedCategories(present: Iterable<string>): string[] {
  const set = new Set(present);
  const known = CATEGORY_ORDER.filter((c) => set.has(c));
  const unknown = [...set].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [
    ...known.filter((c) => c !== UNCATEGORISED),
    ...unknown,
    ...(set.has(UNCATEGORISED) ? [UNCATEGORISED] : []),
  ];
}

function categoryTitle(slug: string): string {
  if (slug === UNCATEGORISED) return "Other";
  return CATEGORY_TITLE.get(slug) ?? titleCase(slug);
}

const STATUS_DOT: Record<string, string> = {
  public: "dotLive",
  preview: "dotPreview",
  draft: "dotHidden",
};

type StatusFilter = "all" | "incomplete" | "draft" | "pr";

function isStartPage(path: string): boolean {
  return path.endsWith("/start.md");
}

/** One page belonging to a service row — existing or still to create. */
interface PageSlot {
  label: string;
  page?: ContentPageSummary;
  /** Create-mode params when the page doesn't exist yet (form rows only). */
  formId?: string;
  createKind?: "entry" | "start";
}

/** A service as an editor sees it: a human title plus its page(s). */
interface ServiceRow {
  key: string;
  title: string;
  category: string;
  hasForm: boolean;
  searchText: string;
  slots: PageSlot[];
}

function reviewLabel(pr: ContentReviewClaim): string {
  if (pr.changeType === "removed") return "Removal in review";
  if (pr.changeType === "renamed") return "Rename in review";
  if (!pr.writable) return "Review in GitHub";
  return "In review";
}

function PrBadge({
  pr,
  showNumber,
}: {
  pr: ContentReviewClaim;
  showNumber: boolean;
}) {
  return (
    <a
      href={pr.prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-focus"
      aria-label={`Open pull request #${pr.prNumber}: ${reviewLabel(pr)}`}
    >
      <Badge variant="secondary">
        <GitPullRequestIcon size={11} aria-hidden="true" />
        {showNumber ? `PR #${pr.prNumber}` : reviewLabel(pr)}
      </Badge>
    </a>
  );
}

function ContentHome() {
  const { forms } = Route.useLoaderData();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const list = useContentList(true);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Persisted as an array (Sets don't serialize); consumed as a Set.
  const [collapsedList, setCollapsedList] = usePersistedState<string[]>(
    "content-cms:collapsedGroups",
    [],
  );
  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList]);

  const { byForm, noForm } = useMemo(() => {
    const byForm = new Map<
      string,
      { entry?: ContentPageSummary; start?: ContentPageSummary }
    >();
    const noForm: ContentPageSummary[] = [];
    for (const p of list.pages ?? []) {
      if (!p.formId) {
        noForm.push(p);
        continue;
      }
      const slot = byForm.get(p.formId) ?? {};
      const occupied = isStartPage(p.path) ? slot.start : slot.entry;
      if (occupied) {
        // Bad or transitional data can contain two files for the same service
        // slot. Keep the extra path reachable as its own row instead of
        // silently replacing whichever file was encountered first.
        noForm.push(p);
        continue;
      }
      if (isStartPage(p.path)) slot.start = p;
      else slot.entry = p;
      byForm.set(p.formId, slot);
    }
    return { byForm, noForm };
  }, [list.pages]);

  // One unified row per service: form-backed services get their two page
  // slots (existing or creatable); standalone pages get a single slot. The
  // same row component renders both, so nothing looks second-class.
  const rows = useMemo<ServiceRow[]>(() => {
    const formIds = new Set<string>();
    for (const f of forms) formIds.add(f.formId);
    for (const id of byForm.keys()) formIds.add(id);

    const formRows = [...formIds].map((formId): ServiceRow => {
      const slots = byForm.get(formId) ?? {};
      const title =
        forms.find((f) => f.formId === formId)?.title ||
        slots.entry?.title ||
        slots.start?.title ||
        formId;
      const category = slots.entry?.category || slots.start?.category || "";
      // Single-page services: the service page renders the form's Start
      // button itself (bare data-start-link), so don't offer to create a
      // separate start page — it would duplicate the button.
      const selfContained = !slots.start && !!slots.entry?.hasFormButton;
      const slotList: PageSlot[] = [
        {
          label: "Service page",
          page: slots.entry,
          formId,
          createKind: "entry",
        },
      ];
      if (!selfContained) {
        slotList.push({
          label: "Start page",
          page: slots.start,
          formId,
          createKind: "start",
        });
      }
      return {
        key: `form:${formId}`,
        title,
        category,
        hasForm: true,
        searchText: `${title} ${formId}`.toLowerCase(),
        slots: slotList,
      };
    });

    const pageRows = noForm.map(
      (p): ServiceRow => ({
        key: `page:${p.path}`,
        title: p.title || p.path.slice(CONTENT_ROOT.length),
        category: p.category,
        hasForm: false,
        searchText: `${p.title} ${p.formId} ${p.path}`.toLowerCase(),
        slots: [{ label: "Page", page: p }],
      }),
    );

    return [...formRows, ...pageRows].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
  }, [forms, byForm, noForm]);

  const hasPR = (p?: ContentPageSummary) =>
    !!p && (list.openPRs.get(p.path)?.length ?? 0) > 0;

  function matchesStatus(row: ServiceRow): boolean {
    switch (statusFilter) {
      case "incomplete":
        return row.hasForm && row.slots.some((sl) => !sl.page);
      case "draft":
        return row.slots.some((sl) => sl.page?.visibility === "draft");
      case "pr":
        return row.slots.some((sl) => hasPR(sl.page));
      default:
        return true;
    }
  }

  const q = filter.trim().toLowerCase();
  const visibleRows = rows.filter(
    (r) =>
      (!q || r.searchText.includes(q)) &&
      (!categoryFilter || (r.category || UNCATEGORISED) === categoryFilter) &&
      matchesStatus(r),
  );

  const groups = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const r of visibleRows) {
      const k = r.category || UNCATEGORISED;
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    }
    return orderedCategories(map.keys()).map((c) => ({
      slug: c,
      title: categoryTitle(c),
      rows: map.get(c)!,
    }));
  }, [visibleRows]);

  const presentCategories = useMemo(
    () => orderedCategories(rows.map((r) => r.category || UNCATEGORISED)),
    [rows],
  );

  // `useEffect` starts the request after the first paint, so `pages === null`
  // is the reliable initial loading signal. The explicit error branch below
  // still wins once loading fails.
  const loading = list.pages === null;
  const formRowsAll = rows.filter((r) => r.hasForm);
  const linkedCount = formRowsAll.filter((r) =>
    r.slots.some((sl) => sl.page),
  ).length;
  const missingCount = formRowsAll.filter((r) =>
    r.slots.some((sl) => !sl.page),
  ).length;
  const openPRCount = new Set(
    [...list.openPRs.values()].flat().map((claim) => claim.prNumber),
  ).size;

  const toggle = (slug: string) =>
    setCollapsedList((cur) =>
      cur.includes(slug) ? cur.filter((c) => c !== slug) : [...cur, slug],
    );

  function chip(slot: PageSlot) {
    if (slot.page) {
      const claims = list.openPRs.get(slot.page.path) ?? [];
      const editable =
        claims.length === 0 || (claims.length === 1 && claims[0].writable);
      const status =
        VISIBILITY_WORD[slot.page.visibility as ViewLevel] ?? "Live";
      const dot = STATUS_DOT[slot.page.visibility] ?? "dotLive";
      return (
        <span key={slot.label} className={s.pageActions}>
          {editable ? (
            <AppLink
              size="sm"
              to="/content/edit"
              search={{ path: slot.page.path }}
              variant="outline"
              className="h-auto flex-wrap justify-start py-1.5"
              title={slot.page.path.slice(CONTENT_ROOT.length)}
            >
              <PencilEdit02Icon size={13} aria-hidden="true" />
              {slot.label}
              <span className={s.chipStatus}>
                <span className={`${s.dot} ${s[dot]}`} aria-hidden="true" />
                {status}
              </span>
            </AppLink>
          ) : (
            <Badge variant="secondary" className="ml-auto max-w-[55%] truncate">
              {slot.label}
              <span className={s.chipStatus}>{status}</span>
            </Badge>
          )}
          {claims.length > 1 && <Badge variant="warning">Multiple PRs</Badge>}
          {claims.map((claim) => (
            <PrBadge
              key={`${claim.prNumber}:${claim.path}:${claim.previousPath ?? ""}`}
              pr={claim}
              showNumber={claims.length > 1}
            />
          ))}
        </span>
      );
    }
    return (
      <AppLink
        size="sm"
        key={slot.label}
        to="/content/edit"
        search={{ formId: slot.formId!, kind: slot.createKind! }}
        variant="ghost"
        className="border border-dashed border-ui-line"
        title={`Create the ${slot.label.toLowerCase()} for this service`}
      >
        <PlusSignIcon size={13} aria-hidden="true" />
        {slot.label}
      </AppLink>
    );
  }

  return (
    <div className={s.shell}>
      <header className={s.docHeader}>
        <div className={s.headerLeft}>
          <SectionSwitch current="content" />
          <div>
            <div className={s.eyebrow}>Content</div>
            <h1 className={s.docTitle}>Landing pages</h1>
          </div>
        </div>
        <div className={s.headerActions}>
          <Tip
            label={theme === "light" ? "Dark mode" : "Light mode"}
            placement="bottom"
          >
            <Button
              type="button"
              aria-label={theme === "light" ? "Dark mode" : "Light mode"}
              onClick={toggleTheme}
              variant="secondary"
              size="sm"
            >
              {theme === "light" ? (
                <Moon02Icon size={15} />
              ) : (
                <Sun03Icon size={15} />
              )}
            </Button>
          </Tip>
          <Button
            type="button"
            onClick={() => {
              // Re-runs the route loader too, so the forms list (loader data)
              // refreshes along with the pages — not just the content list.
              void router.invalidate();
              list.refetch();
            }}
            disabled={list.loading}
            variant="secondary"
            size="sm"
          >
            <RefreshIcon size={15} />
            {list.loading ? "Refreshing…" : "Refresh"}
          </Button>
          <AppLink
            size="sm"
            to="/content/edit"
            variant="primary"
            aria-disabled={list.loading || Boolean(list.loadError)}
            onClick={(event) => {
              if (list.loading || list.loadError) event.preventDefault();
            }}
          >
            <PlusSignIcon size={15} />
            New page
          </AppLink>
        </div>
      </header>

      <ScrollArea
        className="min-h-0 flex-1"
        aria-label="Landing pages"
        viewportClassName="scroll-fade"
      >
        <div className={s.homeBody}>
          {!loading && (
            <div className={s.statRow}>
              <Elevated
                offset={1}
                shadowLevel={2}
                render={<div />}
                className={s.statCard}
              >
                <span className={s.statIcon}>
                  <File01Icon size={18} />
                </span>
                <span>
                  <div className={s.statValue}>{list.pages?.length ?? 0}</div>
                  <div className={s.statLabel}>Pages</div>
                </span>
              </Elevated>
              <Elevated
                offset={1}
                shadowLevel={2}
                render={<div />}
                className={s.statCard}
              >
                <span className={s.statIcon}>
                  <CheckmarkCircle02Icon size={18} />
                </span>
                <span>
                  <div className={s.statValue}>
                    {linkedCount}/{formRowsAll.length}
                  </div>
                  <div className={s.statLabel}>Services with pages</div>
                </span>
              </Elevated>
              <Elevated
                offset={1}
                shadowLevel={2}
                render={<div />}
                className={s.statCard}
              >
                <span className={s.statIcon}>
                  <Alert02Icon size={18} />
                </span>
                <span>
                  <div className={s.statValue}>{missingCount}</div>
                  <div className={s.statLabel}>Missing a page</div>
                </span>
              </Elevated>
              <Elevated
                offset={1}
                shadowLevel={2}
                render={<div />}
                className={s.statCard}
              >
                <span className={s.statIcon}>
                  <GitPullRequestIcon size={18} />
                </span>
                <span>
                  <div className={s.statValue}>
                    {list.reviewSnapshot.complete ? openPRCount : "—"}
                  </div>
                  <div className={s.statLabel}>In review</div>
                </span>
              </Elevated>
            </div>
          )}

          <div className={s.filterBar}>
            <div className={s.searchWrap}>
              <label className={s.srOnly} htmlFor="content-page-search">
                Find a page by name
              </label>
              <Search01Icon
                size={15}
                className={s.searchIcon}
                aria-hidden="true"
              />
              <Input
                id="content-page-search"
                name="content-page-search"
                type="search"
                placeholder="Find a page by name…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-9"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(nextValue) => {
                if (nextValue === null) return;
                setCategoryFilter(nextValue);
              }}
              aria-label="Filter by category"
              className="w-auto min-w-40"
              items={[
                { value: "", label: "All categories" },
                ...presentCategories.map((c) => ({
                  value: c,
                  label:
                    c === UNCATEGORISED ? "Uncategorised" : categoryTitle(c),
                })),
              ]}
            />
            <Select
              value={statusFilter}
              onValueChange={(nextValue) => {
                if (nextValue === null) return;
                setStatusFilter(nextValue as StatusFilter);
              }}
              aria-label="Filter by status"
              className="w-auto min-w-40"
              items={[
                { value: "all", label: "Any status" },
                { value: "incomplete", label: "Missing a page" },
                { value: "draft", label: "Hidden (draft)" },
                { value: "pr", label: "In review" },
              ]}
            />
          </div>

          <ErrorBanner
            error={
              list.loadError
                ? `Existing pages couldn’t be loaded (${list.loadError}). Refresh before creating or deploying a page.`
                : null
            }
          />
          {list.reviewError && !list.loadError && (
            <Banner variant="error" role="alert">
              <div className="min-w-0 space-y-2">
                <span>
                  {list.reviewError} You can keep drafting, but refresh before
                  deploying so an existing PR is not duplicated.
                </span>
                <Button
                  type="button"
                  onClick={() => list.refetch()}
                  disabled={list.loading}
                  variant="secondary"
                  size="sm"
                >
                  Retry review check
                </Button>
              </div>
            </Banner>
          )}

          {list.loadError && list.pages === null ? (
            <div className={s.emptyState}>
              <p>
                Page creation is paused until the current repository inventory
                can be loaded safely.
              </p>
              <Button
                type="button"
                onClick={() => list.refetch()}
                disabled={list.loading}
                variant="secondary"
                size="sm"
              >
                Retry loading pages
              </Button>
            </div>
          ) : loading ? (
            <div
              aria-busy="true"
              aria-label="Loading pages"
              className="space-y-4"
            >
              <div className={s.statRow}>
                {[0, 1, 2, 3].map((i) => (
                  <Elevated
                    offset={1}
                    shadowLevel={2}
                    key={i}
                    className={s.statCard}
                  >
                    <div className="w-full space-y-2">
                      <SkeletonLine minWidth={40} maxWidth={40} />
                      <SkeletonLine minWidth={70} maxWidth={70} />
                    </div>
                  </Elevated>
                ))}
              </div>
              <Elevated
                offset={1}
                shadowLevel={2}
                className="space-y-5 rounded-xl p-5"
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <SkeletonLine
                    key={i}
                    minWidth={55 - i * 6}
                    maxWidth={55 - i * 6}
                  />
                ))}
              </Elevated>
            </div>
          ) : groups.length === 0 ? (
            <div className={s.emptyState}>
              <p>No pages match the current search and filters.</p>
              <Button
                type="button"
                onClick={() => {
                  setFilter("");
                  setCategoryFilter("");
                  setStatusFilter("all");
                }}
                variant="secondary"
                size="sm"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            groups.map((g) => {
              const isCollapsed = collapsed.has(g.slug);
              return (
                <Collapsible
                  key={g.slug}
                  open={!isCollapsed}
                  onOpenChange={() => toggle(g.slug)}
                  render={<section />}
                >
                  <Collapsible.Trigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="my-4 h-auto w-full justify-start px-1 py-2"
                      />
                    }
                  >
                    <span className={s.groupChevron}>
                      {isCollapsed ? (
                        <ArrowRight01Icon size={15} />
                      ) : (
                        <ArrowDown01Icon size={15} />
                      )}
                    </span>
                    <span className={s.groupTitle}>{g.title}</span>
                    <Badge variant="secondary">{g.rows.length}</Badge>
                  </Collapsible.Trigger>
                  <Collapsible.Panel>
                    <Elevated
                      offset={1}
                      shadowLevel={2}
                      render={<ul />}
                      className={s.groupCard}
                    >
                      {g.rows.map((r) => (
                        <li key={r.key} className={s.svcRow}>
                          <span className={s.svcTitle} title={r.title}>
                            {r.title}
                          </span>
                          <span className={s.chipRow}>
                            {r.slots.map((sl) => chip(sl))}
                          </span>
                        </li>
                      ))}
                    </Elevated>
                  </Collapsible.Panel>
                </Collapsible>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
