import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
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
import type { ContentPageSummary, OpenContentPR } from "./-server";
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

/** Opens the PR in a new tab from inside a row that is itself a Link. */
function PrBadge({ pr }: { pr: OpenContentPR }) {
  const openPr = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(pr.prUrl, "_blank", "noopener");
  };
  return (
    <span
      className={`${s.badge} ${s.badgePr} ${s.badgeClickable}`}
      role="link"
      tabIndex={0}
      title={`Open pull request #${pr.prNumber}`}
      onClick={openPr}
      onKeyDown={(e) => {
        if (e.key === "Enter") openPr(e);
      }}
    >
      <GitPullRequestIcon size={11} style={{ marginRight: 3 }} />
      In review
    </span>
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
        searchText: `${p.title} ${p.path}`.toLowerCase(),
        slots: [{ label: "Page", page: p }],
      }),
    );

    return [...formRows, ...pageRows].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
  }, [forms, byForm, noForm]);

  const hasPR = (p?: ContentPageSummary) => !!p && list.openPRs.has(p.path);

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

  const loading = list.pages === null;
  const formRowsAll = rows.filter((r) => r.hasForm);
  const linkedCount = formRowsAll.filter((r) =>
    r.slots.some((sl) => sl.page),
  ).length;
  const missingCount = formRowsAll.filter((r) =>
    r.slots.some((sl) => !sl.page),
  ).length;
  const openPRCount = new Set([...list.openPRs.values()].map((p) => p.prNumber))
    .size;

  const toggle = (slug: string) =>
    setCollapsedList((cur) =>
      cur.includes(slug) ? cur.filter((c) => c !== slug) : [...cur, slug],
    );

  function chip(slot: PageSlot) {
    if (slot.page) {
      const pr = list.openPRs.get(slot.page.path);
      const status =
        VISIBILITY_WORD[slot.page.visibility as ViewLevel] ?? "Live";
      const dot = STATUS_DOT[slot.page.visibility] ?? "dotLive";
      return (
        <Link
          key={slot.label}
          to="/content/edit"
          search={{ path: slot.page.path }}
          className={`${s.chip} ${s.chipFilled}`}
          title={slot.page.path.slice(CONTENT_ROOT.length)}
        >
          <PencilEdit02Icon size={13} />
          {slot.label}
          <span className={s.chipStatus}>
            <span className={`${s.dot} ${s[dot]}`} />
            {status}
          </span>
          {pr && <PrBadge pr={pr} />}
        </Link>
      );
    }
    return (
      <Link
        key={slot.label}
        to="/content/edit"
        search={{ formId: slot.formId!, kind: slot.createKind! }}
        className={`${s.chip} ${s.chipMissing}`}
        title={`Create the ${slot.label.toLowerCase()} for this service`}
      >
        <PlusSignIcon size={13} />
        {slot.label}
      </Link>
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
            <button
              type="button"
              className={s.secondaryBtn}
              aria-label={theme === "light" ? "Dark mode" : "Light mode"}
              onClick={toggleTheme}
            >
              {theme === "light" ? (
                <Moon02Icon size={15} />
              ) : (
                <Sun03Icon size={15} />
              )}
            </button>
          </Tip>
          <button
            type="button"
            className={s.secondaryBtn}
            onClick={() => {
              // Re-runs the route loader too, so the forms list (loader data)
              // refreshes along with the pages — not just the content list.
              void router.invalidate();
              list.refetch();
            }}
            disabled={list.loading}
          >
            <RefreshIcon size={15} />
            {list.loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link to="/content/edit" className={s.primaryBtn}>
            <PlusSignIcon size={15} />
            New page
          </Link>
        </div>
      </header>

      <div className={s.homeBody}>
        {!loading && (
          <div className={s.statRow}>
            <div className={s.statCard}>
              <span className={s.statIcon}>
                <File01Icon size={18} />
              </span>
              <span>
                <div className={s.statValue}>{list.pages?.length ?? 0}</div>
                <div className={s.statLabel}>Pages</div>
              </span>
            </div>
            <div className={s.statCard}>
              <span className={s.statIcon}>
                <CheckmarkCircle02Icon size={18} />
              </span>
              <span>
                <div className={s.statValue}>
                  {linkedCount}/{formRowsAll.length}
                </div>
                <div className={s.statLabel}>Services with pages</div>
              </span>
            </div>
            <div className={s.statCard}>
              <span className={s.statIcon}>
                <Alert02Icon size={18} />
              </span>
              <span>
                <div className={s.statValue}>{missingCount}</div>
                <div className={s.statLabel}>Missing a page</div>
              </span>
            </div>
            <div className={s.statCard}>
              <span className={s.statIcon}>
                <GitPullRequestIcon size={18} />
              </span>
              <span>
                <div className={s.statValue}>{openPRCount}</div>
                <div className={s.statLabel}>In review</div>
              </span>
            </div>
          </div>
        )}

        <div className={s.filterBar}>
          <div className={s.searchWrap}>
            <Search01Icon size={15} className={s.searchIcon} />
            <input
              className={s.filterInput}
              placeholder="Find a page by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            className={s.filterSelect}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {presentCategories.map((c) => (
              <option key={c} value={c}>
                {c === UNCATEGORISED ? "Uncategorised" : categoryTitle(c)}
              </option>
            ))}
          </select>
          <select
            className={s.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">Any status</option>
            <option value="incomplete">Missing a page</option>
            <option value="draft">Hidden (draft)</option>
            <option value="pr">In review</option>
          </select>
        </div>

        <ErrorBanner
          error={
            list.loadError
              ? `Couldn’t load existing pages (${list.loadError}). You can still create pages.`
              : null
          }
        />

        {loading ? (
          <div className="t-skel" aria-busy="true" aria-label="Loading pages">
            <div
              className="t-skel-skeleton is-pulsing"
              style={{ "--pulse-count": "infinite" } as React.CSSProperties}
            >
              <div className={s.statRow}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={s.statCard}>
                    <span
                      className={`${s.skel} ${s.statIcon}`}
                      style={{ background: "var(--el-150)" }}
                    />
                    <span style={{ flex: 1 }}>
                      <div
                        className={s.skel}
                        style={{ height: 16, width: "40%" }}
                      />
                      <div
                        className={s.skel}
                        style={{ height: 10, width: "70%", marginTop: 6 }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <ul className={s.groupCard} style={{ marginTop: 22 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className={s.svcRow}>
                    <span
                      className={s.skel}
                      style={{ height: 14, width: `${55 - i * 6}%` }}
                    />
                    <span
                      className={s.skel}
                      style={{ height: 26, width: 200 }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <p className={s.modalNote}>No matching pages.</p>
        ) : (
          groups.map((g) => {
            const isCollapsed = collapsed.has(g.slug);
            return (
              <section key={g.slug}>
                <button
                  type="button"
                  className={s.groupHeader}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(g.slug)}
                >
                  <span className={s.groupChevron}>
                    {isCollapsed ? (
                      <ArrowRight01Icon size={15} />
                    ) : (
                      <ArrowDown01Icon size={15} />
                    )}
                  </span>
                  <span className={s.groupTitle}>{g.title}</span>
                  <span className={s.groupCount}>{g.rows.length}</span>
                </button>
                {!isCollapsed && (
                  <ul className={s.groupCard}>
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
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
