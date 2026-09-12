import { useConfirmation } from "../ui/dialog/confirmation";
import { Loader } from "../ui/loader";
import { Empty } from "../ui/empty";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useState } from "react";
import { GitPullRequestIcon } from "hugeicons-react";
import { getRecipe } from "../../server/forms";
import type { OpenDeployPR } from "../../server/publish";
import { deserializeRecipe } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { BuilderFormSummary } from "../../types/index";
import { Dialog } from "../ui/dialog";
import { loadFormDraft } from "./load-form-draft";

interface FormPickerProps {
  open: boolean;
  allowDuplicate?: boolean;
  /** The forms to choose from, or `null` while the background fetch is in flight. */
  forms: BuilderFormSummary[] | null;
  /** A message if the background fetch failed, otherwise `null`. */
  loadError: string | null;
  isDirty: boolean;
  catalog: RegistryCatalog;
  /**
   * Open Deploy PRs keyed by formId (#2390), badging a row "In review". Optional
   * with an empty-map default so this stays wire-compatible with callers that
   * haven't threaded it through yet.
   */
  openPRs?: Map<string, OpenDeployPR>;
  onLoad: (draft: RecipeDraft, formId: string) => void;
  onClose: () => void;
  /** Draft-only forms: hard-delete the draft rows (formId freed for reuse). */
  onRequestDelete: (form: BuilderFormSummary) => void;
  /** Live published forms: write the tombstone (public site -> 410), reversible. */
  onRequestDisable: (form: BuilderFormSummary) => void;
  /** Live published forms: permanently erase the on-disk recipe folder via PR. */
  onRequestErase: (form: BuilderFormSummary) => void;
  /** Disabled published forms: clear the tombstone and restore the service. */
  onEnable: (form: BuilderFormSummary) => void;
  /** Open the chosen form's recipe as a new unsaved "Copy of …" draft. */
  onDuplicate: (draft: RecipeDraft) => void;
}

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

function PrBadge({ pr }: { pr: OpenDeployPR }) {
  return (
    <a
      href={pr.prUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open pull request #${pr.prNumber}`}
      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
    >
      <Badge
        variant="info"
        icon={<GitPullRequestIcon size={12} aria-hidden="true" />}
      >
        In review
      </Badge>
    </a>
  );
}

export function FormPicker({
  open,
  allowDuplicate = true,
  forms,
  loadError,
  isDirty,
  catalog,
  openPRs,
  onLoad,
  onClose,
  onRequestDelete,
  onRequestDisable,
  onRequestErase,
  onEnable,
  onDuplicate,
}: FormPickerProps) {
  const confirm = useConfirmation();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // `forms` is null while the background fetch is in flight; treat that as an
  // empty list for filtering so the loading/empty states below own the messaging.
  const filtered = (forms ?? []).filter((form) =>
    matches(query, form.title, form.formId),
  );

  async function handleSelect(form: BuilderFormSummary) {
    if (
      isDirty &&
      !(await confirm({
        title: "Discard unsaved changes?",
        description: "Unsaved changes will be lost. Continue?",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    setError(null);
    setLoadingId(form.formId);
    try {
      const draft = await loadFormDraft(form.formId, catalog);
      onLoad(draft, form.formId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipe");
    } finally {
      setLoadingId(null);
    }
  }

  // Duplicate opens the chosen recipe as a brand-new unsaved draft. Only the
  // recipe is fetched (not the config sidecar): the form-definition processors
  // ride in the recipe, while the DB-only siblings (mdaContactId, payment
  // processors) are env-specific and intentionally start blank on the copy.
  // deserializeRecipe mints fresh editor ids, so the copy shares nothing
  // mutable with the source. The "-copy" formId / "Copy of" title seed unique
  // identifiers; the builder's live uniqueness check flags them if they collide
  // (e.g. duplicating the same form twice) so the author renames before saving.
  async function handleDuplicate(form: BuilderFormSummary) {
    if (
      isDirty &&
      !(await confirm({
        title: "Discard unsaved changes?",
        description: "Unsaved changes will be lost. Continue?",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    setError(null);
    setLoadingId(form.formId);
    try {
      const recipe = (await getRecipe({
        data: { formId: form.formId },
      })) as ServiceContractRecipe;
      const draft = deserializeRecipe(recipe, catalog);
      onDuplicate({
        ...draft,
        formId: `${draft.formId}-copy`,
        title: `Copy of ${draft.title}`,
        // A duplicate is a brand-new, unpublished form — start it hidden so it
        // can't inherit a `public` source's launch state by accident (#1682).
        meta: { visibility: "draft" },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipe");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          setQuery("");
          setError(null);
          setLoadingId(null);
        }
      }}
    >
      <Dialog size="xl" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Open Form</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>
        <div className="relative">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms…"
            className="w-full pr-10"
            aria-label="Search forms"
            autoFocus
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </Button>
          )}
        </div>
        {(error || loadError) && (
          <Banner variant="error" role="alert" size="sm">
            {error || loadError}
          </Banner>
        )}
        {forms === null && !loadError && (
          <div
            role="status"
            className="flex items-center gap-2 py-6 text-ui-subtle"
          >
            <Loader size="sm" />
            Loading forms…
          </div>
        )}
        {forms !== null && forms.length === 0 && (
          <Empty title="No forms found." />
        )}
        {forms !== null && forms.length > 0 && filtered.length === 0 && (
          <Empty title="No forms match your search." />
        )}
        {filtered.length > 0 && (
          <ScrollArea
            className="h-[min(55dvh,30rem)]"
            viewportClassName="scroll-fade"
          >
            <div className="space-y-3 p-1">
              {filtered.map((form) => {
                const pr = openPRs?.get(form.formId);
                return (
                  <div
                    key={form.id}
                    className="rounded-lg border border-ui-hairline p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="max-w-full justify-start truncate font-semibold"
                        disabled={!!loadingId || form.isOrphanOverride}
                        loading={loadingId === form.formId}
                        onClick={() => handleSelect(form)}
                      >
                        {form.title || form.formId}
                      </Button>
                      {!form.isOrphanOverride && (
                        <Badge variant="secondary">v{form.version}</Badge>
                      )}
                      {form.isPublished && (
                        <Badge variant="success">Published</Badge>
                      )}
                      {form.visibility && form.visibility !== "public" && (
                        <Badge variant="secondary" className="capitalize">
                          {form.visibility}
                        </Badge>
                      )}
                      {form.isDisabled && (
                        <Badge variant="error">Disabled</Badge>
                      )}
                      {pr && <PrBadge pr={pr} />}
                    </div>
                    <p className="mt-1 break-all px-2 text-xs text-ui-subtle">
                      {form.formId}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {allowDuplicate && !form.isOrphanOverride && (
                        <Button
                          size="sm"
                          disabled={!!loadingId}
                          onClick={() => handleDuplicate(form)}
                        >
                          Duplicate
                        </Button>
                      )}
                      {form.isDisabled ? (
                        <Button
                          size="sm"
                          disabled={!!loadingId}
                          onClick={() => onEnable(form)}
                        >
                          Enable
                        </Button>
                      ) : !form.isPublished ? (
                        <Button
                          variant="secondary-destructive"
                          size="sm"
                          disabled={!!loadingId}
                          onClick={() => onRequestDelete(form)}
                        >
                          Delete
                        </Button>
                      ) : (
                        <>
                          {form.hasDraftRow && (
                            <Button
                              size="sm"
                              disabled={!!loadingId}
                              onClick={() => onRequestDelete(form)}
                            >
                              Delete working copy
                            </Button>
                          )}
                          <Button
                            variant="secondary-destructive"
                            size="sm"
                            disabled={!!loadingId}
                            onClick={() => onRequestDisable(form)}
                          >
                            Disable
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={!!loadingId}
                            onClick={() => onRequestErase(form)}
                          >
                            Erase
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Dialog>
    </Dialog.Root>
  );
}
