import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { checkSession, logoutSession } from "../server/auth";
import { listServices, setServiceStatus } from "../server/service-status";
import type { ServiceRow } from "../lib/catalogue";
import {
  SERVICE_STATUS_VALUES,
  STATUS_LABELS,
  type ServiceStatus,
} from "../lib/service-status";
import { AuditDrawer } from "./-audit-drawer";

export const Route = createFileRoute("/")({
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

type StatusFilter = ServiceStatus | "all";

function ServicesPage() {
  const initial = Route.useLoaderData();
  const { login } = Route.useRouteContext();
  const [rows, setRows] = useState<ServiceRow[]>(initial);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [audit, setAudit] = useState<{ slug: string; title: string } | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.category?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, statusFilter]);

  async function changeStatus(row: ServiceRow, next: ServiceStatus) {
    const prev = row.status;
    if (prev === next) return;
    // Optimistic: reflect the change immediately, roll back on failure.
    setRows((rs) =>
      rs.map((r) => (r.slug === row.slug ? { ...r, status: next } : r)),
    );
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
        {rows.length} services. Changing a status writes to the service_status
        audit log against your GitHub login.
      </p>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by title, slug or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
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
              <th>Service</th>
              <th>Category</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.slug}>
                <td>
                  <div className="svc-title">{row.title}</div>
                  <div className="svc-slug">{row.slug}</div>
                  {errors[row.slug] && (
                    <div className="row-error">{errors[row.slug]}</div>
                  )}
                </td>
                <td>{row.category ?? "—"}</td>
                <td>
                  {row.hasForm ? (
                    <span className="badge form">Form</span>
                  ) : (
                    <span className="badge">Info</span>
                  )}
                  {row.orphan && <span className="badge orphan">Orphan</span>}
                </td>
                <td>
                  <select
                    className={`status status-${row.status}`}
                    value={row.status}
                    disabled={saving[row.slug]}
                    onChange={(e) =>
                      void changeStatus(row, e.target.value as ServiceStatus)
                    }
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No services match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
