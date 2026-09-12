import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  type FormState,
  EMPTY_PAGE,
  LANDING_CATEGORIES,
  contentSlug,
  isValidSlug,
  isValidContentSlug,
  startPageContentPath,
  startPageUrl,
} from "../../lib/content";
import { createPageDraft } from "../content/draft-store";
import type { ContentPageSummary } from "../../server/content";
import type { ServiceRow } from "./service-model";

export function CreatePageDialog({
  service,
  pages,
  open,
  onOpenChange,
  onCreate,
}: {
  service?: ServiceRow;
  pages: ContentPageSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: (path: string, state: FormState) => Promise<void>;
}) {
  const navigate = useNavigate();
  const firstPage = !!service && service.pages.length === 0;
  const [title, setTitle] = useState(firstPage ? service.title : "");
  const [customSlug, setCustomSlug] = useState("");
  const [category, setCategory] = useState(service?.category ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = firstPage
    ? "index"
    : customSlug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
  const targetSlug = service
    ? `${service.contentRoot}/${slug}`
    : `${slug}/index`;
  const valid = isValidSlug(slug) && isValidContentSlug(targetSlug);
  const path = valid ? startPageContentPath(targetSlug) : "";
  const collision =
    !!path &&
    pages.some((page) => contentSlug(page.path) === contentSlug(path));
  const dialogTitle = service ? "Add content page" : "Create a service";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base">
        <Dialog.Title>{dialogTitle}</Dialog.Title>
        <Dialog.Description>
          {service
            ? "Create a separate page in this service. Each page has its own content and draft."
            : "Start with a main page. You can add one form and more content pages from the service."}
        </Dialog.Description>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid || collision || !title.trim() || busy) return;
            setBusy(true);
            try {
              const next = {
                ...EMPTY_PAGE,
                title: title.trim(),
                slug: targetSlug,
                category,
                subcategory: service?.subcategory ?? "",
                formId: service?.formId ?? "",
              };
              if (onCreate) {
                await onCreate(path, next);
                onOpenChange(false);
                return;
              }
              createPageDraft(path, next);
              await navigate({
                to: "/content/edit",
                search: {
                  createPath: path,
                  service: service?.key ?? `page:${path}`,
                },
              });
              onOpenChange(false);
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not open the new page.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            label={service ? "Page title" : "Service name"}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          {!firstPage && (
            <Input
              label="URL name"
              value={customSlug || slug}
              onChange={(event) => setCustomSlug(event.target.value)}
              required
            />
          )}
          {!service && (
            <Select
              label="Category"
              value={category}
              onValueChange={(value) => value !== null && setCategory(value)}
              items={[
                { value: "", label: "No category" },
                ...LANDING_CATEGORIES.map((item) => ({
                  value: item.slug,
                  label: item.title,
                })),
              ]}
            />
          )}
          {valid && (
            <p className="break-all text-xs text-ui-subtle">
              {startPageUrl(category, targetSlug, service?.subcategory)}
            </p>
          )}
          {collision && (
            <p role="alert" className="text-sm text-ui-danger">
              A page or draft already uses this URL. Open it from the service or
              choose another name.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-ui-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !valid || collision || !title.trim()}
            >
              {service ? "Create page" : "Create service"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
