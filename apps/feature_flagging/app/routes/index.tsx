import {
  createFileRoute,
  redirect,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkSession, logoutSession } from "../server/auth";
import { listServices, setServiceStatus } from "../server/service-status";
import {
  serviceTypeLabel,
  sortServiceRows,
  type ServiceRow,
  type SortDir,
  type SortKey,
} from "../lib/catalogue";
import {
  SERVICE_STATUS_VALUES,
  STATUS_LABELS,
  type ServiceStatus,
} from "../lib/service-status";
import {
  parseSearch,
  stripDefaults,
  type ServicesSearch,
  type StatusFilter,
} from "../lib/search-params";
import { useRowAnimations } from "../lib/use-row-animations";
import { AuditDrawer } from "./-audit-drawer";

export const Route = createFileRoute("/")({
  // Filters and sort live in the URL so a refresh (or a shared link) restores
  // the same view; defaults are stripped so an unfiltered table stays at `/`.
  // `SearchSchemaInput` marks every param optional for navigation (so a bare
  // `redirect({ to: "/" })` still type-checks) while `useSearch` reads them back
  // fully defaulted.
  validateSearch: (
    search: Partial<ServicesSearch> & SearchSchemaInput,
  ): ServicesSearch => parseSearch(search),
  // Gate initial navigation: an unauthenticated visitor is sent to the login
  // page in every environment. The server functions below are independently
  // guarded by requireSession.
  beforeLoad: async () => {
    const session = await checkSession().catch(() => null);
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { login: session.login };
  },
  loader: () => listServices(),
  component: ServicesPage,
});

function ServicesPage() {
  const initial = Route.useLoaderData();
  const { login } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [rows, setRows] = useState<ServiceRow[]>(initial);
  const {
    q: query,
    category: categoryFilter,
    type: typeFilter,
    status: statusFilter,
    sortKey,
    sortDir,
  } = search;
  const sort = { key: sortKey, dir: sortDir };

  // Merge a patch into the URL search, dropping any field back at its default so
  // the URL only ever carries the filters/sort that differ from the base view.
  // `replace` keeps typing in the search box out of the browser history stack.
  const update = (patch: Partial<ServicesSearch>) =>
    void navigate({
      replace: true,
      search: (prev) => stripDefaults({ ...prev, ...patch }),
    });

  // The search box updates its own text instantly but only writes `q` to the
  // URL after a 500ms pause, so a burst of keystrokes triggers one navigation
  // instead of one per character. `qInput` re-syncs whenever `q` changes from
  // outside typing (back/forward, a shared link).
  const [qInput, setQInput] = useState(query);
  const qTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setQInput(query), [query]);
  useEffect(() => () => clearTimeout(qTimer.current), []);
  const onQueryChange = (value: string) => {
    setQInput(value);
    clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => update({ q: value }), 500);
  };

  const [audit, setAudit] = useState<{ slug: string; title: string } | null>(
    null,
  );
  const [pending, setPending] = useState<{
    row: ServiceRow;
    next: ServiceStatus;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Category options are the distinct categories present, alphabetical.
  const categories = useMemo(
    () =>
      [
        ...new Set(
          rows.map((r) => r.category).filter((c): c is string => Boolean(c)),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [rows],
  );
  // Type options are the canonical labels that actually appear in the rows.
  const types = useMemo(() => {
    const present = new Set(
      rows
        .map((r) => serviceTypeLabel(r))
        .filter((t): t is string => t !== null),
    );
    return ["Content + Form", "Content", "Form only"].filter((t) =>
      present.has(t),
    );
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (categoryFilter !== "all" && r.category !== categoryFilter)
        return false;
      if (typeFilter !== "all" && serviceTypeLabel(r) !== typeFilter)
        return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.category?.toLowerCase().includes(q) ?? false)
      );
    });
    return sortServiceRows(filtered, sortKey, sortDir);
  }, [rows, query, statusFilter, categoryFilter, typeFilter, sortKey, sortDir]);

  // Drives the FLIP reorder animation: changes whenever the rendered order does.
  const anim = useRowAnimations(visible.map((r) => r.slug).join(","));

  const isFiltered =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    typeFilter !== "all";

  function toggleSort(key: SortKey) {
    const dir =
      sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    update({ sortKey: key, sortDir: dir });
  }

  async function changeStatus(row: ServiceRow, next: ServiceStatus) {
    const prev = row.status;
    if (prev === next) return;
    // Optimistic: reflect the change immediately, roll back on failure.
    setRows((rs) =>
      rs.map((r) => (r.slug === row.slug ? { ...r, status: next } : r)),
    );
    // Highlight the just-changed row; it fades as the row slides to its new
    // sorted position (both run on the same, slug-keyed DOM node).
    anim.flash(row.slug);
    setErrors((e) => ({ ...e, [row.slug]: "" }));
    setSaving((s) => ({ ...s, [row.slug]: true }));
    try {
      await setServiceStatus({ data: { slug: row.slug, status: next } });
    } catch (err: unknown) {
      setRows((rs) =>
        rs.map((r) => (r.slug === row.slug ? { ...r, status: prev } : r)),
      );
      setErrors((e) => ({
        ...e,
        [row.slug]:
          err instanceof Error ? err.message : "Failed to update status",
      }));
    } finally {
      setSaving((s) => ({ ...s, [row.slug]: false }));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Service visibility</h1>
        <span className="who">
          {login} ·{" "}
          <button
            type="button"
            className="linklike"
            onClick={() =>
              void logoutSession().then(() => window.location.assign("/"))
            }
          >
            Sign out
          </button>
        </span>
      </div>
      <p className="page-sub">
        {isFiltered
          ? `Showing ${visible.length} of ${rows.length} services.`
          : `${rows.length} services.`}{" "}
        Changing a status writes to the service_status audit log against your
        GitHub login.
      </p>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by title, slug or category…"
          value={qInput}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search services"
        />
        <select
          value={categoryFilter}
          onChange={(e) => update({ category: e.target.value })}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => update({ type: e.target.value })}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => update({ status: e.target.value as StatusFilter })}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {SERVICE_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortHeader
                label="Service"
                col="service"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="Category"
                col="category"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="Type"
                col="type"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="Status"
                col="status"
                sort={sort}
                onSort={toggleSort}
              />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.slug} ref={anim.register(row.slug)}>
                <td>
                  <div className="svc-title">{row.title}</div>
                  <div className="svc-slug">{row.slug}</div>
                  {errors[row.slug] && (
                    <div className="row-error">{errors[row.slug]}</div>
                  )}
                </td>
                <td>{row.category ?? "—"}</td>
                <td>
                  <TypeBadge row={row} />
                  {row.orphan && <span className="badge orphan">Orphan</span>}
                </td>
                <td>
                  <select
                    className={`status status-${row.status}`}
                    value={row.status}
                    disabled={saving[row.slug]}
                    onChange={(e) => {
                      const next = e.target.value as ServiceStatus;
                      if (next !== row.status) setPending({ row, next });
                    }}
                    aria-label={`Status for ${row.title}`}
                  >
                    {SERVICE_STATUS_VALUES.map((s) => (
                      <option
                        key={s}
                        value={s}
                        disabled={s === "form_disabled" && !row.hasForm}
                      >
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="linklike"
                    onClick={() =>
                      setAudit({ slug: row.slug, title: row.title })
                    }
                  >
                    History
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No services match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmStatusChange
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const { row, next } = pending;
            setPending(null);
            void changeStatus(row, next);
          }}
        />
      )}

      {audit && (
        <AuditDrawer
          slug={audit.slug}
          title={audit.title}
          onClose={() => setAudit(null)}
        />
      )}
    </div>
  );
}

function TypeBadge({ row }: { row: ServiceRow }) {
  const label = serviceTypeLabel(row);
  if (!label) return null;
  return <span className={`badge${row.hasForm ? " form" : ""}`}>{label}</span>;
}

function SortHeader({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === col;
  return (
    <th aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="th-sort" onClick={() => onSort(col)}>
        {label}
        <span className="sort-ind">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function ConfirmStatusChange({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: { row: ServiceRow; next: ServiceStatus };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { row, next } = pending;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm status change"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Change service status?</h2>
        <p>
          <strong>{row.title}</strong>
          <br />
          <span className="svc-slug">{row.slug}</span>
        </p>
        <p>
          Status will change from{" "}
          <span className={`status-${row.status}`}>
            {STATUS_LABELS[row.status]}
          </span>{" "}
          to{" "}
          <span className={`status-${next}`}>{STATUS_LABELS[next]}</span>.
        </p>
        <p className="modal-warn">
          This changes what the public can see for this service. The change is
          saved immediately, but the public site caches service statuses for up
          to 60 seconds — so it can take a little over a minute to appear live.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            Change status
          </button>
        </div>
      </div>
    </div>
  );
}
