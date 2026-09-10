import { cn } from "../ui/utils/cn";
import { InputArea } from "../ui/input/input-area";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import type { AssistantRequest } from "../ui/ai/prompt-bar";
import {
  LANDING_CATEGORIES,
  VISIBILITY_LEVELS,
  type ViewLevel,
  type StartLinkType,
} from "../../lib/content";
import { BodyEditor } from "../body-editor/body-editor";
import { FormCombobox } from "./form-combobox";
import type { EditorState } from "./use-editor-state";
import type { BuilderFormSummary } from "../../types/index";

/**
 * The editor's form fields, composed two ways by the parent: stacked when the
 * preview pane is open (narrow panel), and as a Payload-style main column +
 * settings rail when it's hidden (full page).
 */
export function PageFields({
  ed,
  formOptions,
  layout,
  onAiAction,
}: {
  ed: EditorState;
  formOptions: BuilderFormSummary[];
  layout: "stacked" | "wide";
  onAiAction?: (request: AssistantRequest) => void;
}) {
  const { state, set, setState } = ed;
  const categoryIsUnlisted =
    Boolean(state.category) &&
    !LANDING_CATEGORIES.some((category) => category.slug === state.category);

  const linkField = (
    <div className="mb-4.5">
      <label
        className="mb-1.5 block text-[13px] font-medium text-ui-default"
        htmlFor="sp-linktype"
      >
        Start button links to
      </label>
      <Select
        id="sp-linktype"
        value={state.linkType}
        onValueChange={(nextValue) => {
          if (nextValue === null) return;
          set("linkType", nextValue as StartLinkType);
        }}
        className="w-full min-w-0"
        items={[
          { value: "form", label: "A form" },
          { value: "slug", label: "Another page (internal)" },
          { value: "external", label: "An external URL" },
          { value: "none", label: "No start button" },
        ]}
      />

      {state.linkType === "none" ? (
        <small className="mt-1.25 block text-[12px] text-ui-subtle">
          An informational page — any existing Start button is removed on
          deploy.
        </small>
      ) : state.linkType === "form" ? (
        <div className="mt-2">
          {formOptions.length === 0 ? (
            <>
              <label className="sr-only" htmlFor="sp-form-id">
                Form ID
              </label>

              <Input
                id="sp-form-id"
                type="text"
                value={state.formId}
                onChange={(e) => set("formId", e.target.value)}
                placeholder="form-id (e.g. get-birth-certificate)"
                className="w-full min-w-0"
              />
            </>
          ) : (
            <FormCombobox
              forms={formOptions}
              value={state.formId}
              onChange={(formId) =>
                setState((cur) => ({
                  ...cur,
                  formId,
                  title:
                    cur.title ||
                    formOptions.find((f) => f.formId === formId)?.title ||
                    "",
                }))
              }
            />
          )}
          {ed.formMissing ? (
            <small className="mt-1.25 block text-[12px] text-ui-danger">
              No form “{state.formId}” in the builder — the Start button won’t
              render until it’s live on the forms manifest.
            </small>
          ) : !state.formId ? (
            <small className="mt-1.25 block text-[12px] text-ui-subtle">
              Choose the form this page’s Start button opens — required before
              deploying.
            </small>
          ) : null}
        </div>
      ) : (
        <div className="mt-2">
          <Input
            type="text"
            value={state.linkHref}
            onChange={(e) => set("linkHref", e.target.value)}
            placeholder={
              state.linkType === "slug"
                ? "/family-birth-relationships/get-birth-certificate"
                : "https://example.gov.bb/apply"
            }
            className="w-full min-w-0"
          />
          <small
            className={cn(
              "mt-1.25 block text-[12px] text-ui-subtle",
              ed.hrefValid ? "" : "text-ui-danger",
            )}
          >
            {state.linkType === "slug"
              ? "Internal path on alpha.gov.bb — must start with /."
              : "Full external URL — must start with https:// (or mailto:)."}
          </small>
        </div>
      )}
    </div>
  );

  const titleField = (
    <div className="mb-4.5">
      <label
        className="mb-1.5 block text-[13px] font-medium text-ui-default"
        htmlFor="sp-title"
      >
        Title
      </label>
      <Input
        id="sp-title"
        type="text"
        value={state.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Get a copy of a birth certificate"
        className="w-full min-w-0"
      />
    </div>
  );

  const collisionHelp = ed.collision && (
    <small className="mt-1.25 block text-[12px] text-ui-danger">
      {ed.collision === "exists"
        ? "A page already exists at this path — open it from the home screen instead."
        : "This collides with an existing page's URL (file vs folder/index)."}
    </small>
  );

  const pathField = ed.fixedPath ? (
    <div className="mb-4.5">
      <span className="mb-1.5 block text-[13px] font-medium text-ui-default">
        File
      </span>
      <small className="mt-1.25 block font-mono text-[12px] text-ui-subtle">
        {ed.fixedPath}
      </small>
      {collisionHelp}
    </div>
  ) : (
    <div className="mb-4.5">
      <label
        className="mb-1.5 block text-[13px] font-medium text-ui-default"
        htmlFor="sp-slug"
      >
        Slug
      </label>
      <Input
        id="sp-slug"
        type="text"
        value={state.slug}
        onChange={(e) => set("slug", e.target.value)}
        placeholder={state.formId || "page-slug"}
        className="w-full min-w-0"
      />
      {!ed.slugValid ? (
        <small className="mt-1.25 block text-[12px] text-ui-danger">
          Must be kebab-case (lowercase, hyphens).
        </small>
      ) : ed.collision ? (
        collisionHelp
      ) : ed.url ? (
        <small className="mt-1.25 block text-[12px] text-ui-subtle">
          URL: {ed.url}
        </small>
      ) : null}
    </div>
  );

  const categoryFields = (
    <>
      <div className="flex gap-3.5 *:flex-1">
        <div className="mb-4.5">
          <label
            className="mb-1.5 block text-[13px] font-medium text-ui-default"
            htmlFor="sp-category"
          >
            Category
          </label>
          <Select
            id="sp-category"
            value={ed.creatingCategory ? "__new__" : state.category}
            onValueChange={(nextValue) => {
              if (nextValue === null) return;
              const v = nextValue;
              ed.setCreatingCategory(v === "__new__");
              setState((cur) => ({
                ...cur,
                category: v === "__new__" ? "" : v,
                subcategory: "",
              }));
            }}
            className="w-full min-w-0"
            items={[
              { value: "", label: "No category" },
              ...LANDING_CATEGORIES.map((c) => ({
                value: c.slug,
                label: c.title,
              })),
              ...(categoryIsUnlisted
                ? [
                    {
                      value: state.category,
                      label: (
                        <>
                          {state.category}

                          {ed.editRevision?.source === "pr"
                            ? " (in this PR)"
                            : " (current page)"}
                        </>
                      ),
                    },
                  ]
                : []),
              { value: "__new__", label: "＋ Create new category…" },
            ]}
          />
        </div>
        {ed.subcats.length > 0 && (
          <div className="mb-4.5">
            <label
              className="mb-1.5 block text-[13px] font-medium text-ui-default"
              htmlFor="sp-subcategory"
            >
              Subcategory
            </label>
            <Select
              id="sp-subcategory"
              value={state.subcategory}
              onValueChange={(nextValue) => {
                if (nextValue === null) return;
                set("subcategory", nextValue);
              }}
              className="w-full min-w-0"
              items={[
                { value: "", label: "None" },
                ...ed.subcats.map((sc) => ({
                  value: sc.slug,
                  label: sc.title,
                })),
              ]}
            />
          </div>
        )}
      </div>

      {ed.creatingCategory && (
        <div className="mb-4.5">
          <label
            className="mb-1.5 block text-[13px] font-medium text-ui-default"
            htmlFor="sp-newcat-title"
          >
            New category name
          </label>
          <Input
            id="sp-newcat-title"
            type="text"
            value={ed.newCatTitle}
            onChange={(e) => {
              ed.setNewCatTitle(e.target.value);
              const slug = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
              setState((cur) => ({ ...cur, category: slug }));
            }}
            placeholder="Housing and land"
            className="w-full min-w-0"
          />
          <label
            className="mb-1.5 block text-[13px] font-medium text-ui-default mt-2"
            htmlFor="sp-newcat-description"
          >
            Category description (optional)
          </label>
          <InputArea
            id="sp-newcat-description"
            rows={2}
            value={ed.newCatDesc}
            onChange={(e) => ed.setNewCatDesc(e.target.value)}
            placeholder="Short description shown on the category page (optional)."
            className="w-full min-w-0"
          />
          <small className="mt-1.25 block text-[12px] text-ui-subtle">
            Adds the category to the site's navigation in the same pull request
            {ed.newCatSlug ? (
              <>
                {" "}
                — URL: <code>/{ed.newCatSlug}</code>
              </>
            ) : null}
            . A reviewer approves the new section before it goes live.
          </small>
        </div>
      )}
    </>
  );

  const descriptionField = (
    <div className="mb-4.5">
      <label
        className="mb-1.5 block text-[13px] font-medium text-ui-default"
        htmlFor="sp-description"
      >
        Description
      </label>
      <InputArea
        id="sp-description"
        rows={2}
        value={state.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Short summary shown in category listings and search."
        className="w-full min-w-0"
      />
    </div>
  );

  const visibilityField = (
    <div className="mb-4.5">
      <label
        className="mb-1.5 block text-[13px] font-medium text-ui-default"
        htmlFor="sp-visibility"
      >
        Visibility
      </label>
      <Select
        id="sp-visibility"
        value={state.visibility}
        onValueChange={(nextValue) => {
          if (nextValue === null) return;
          set("visibility", nextValue as ViewLevel);
        }}
        className="w-full min-w-0"
        items={[
          ...VISIBILITY_LEVELS.map((v) => ({ value: v.value, label: v.label })),
        ]}
      />
    </div>
  );

  const bodyField = (
    <div className="mb-4.5">
      <label
        className="mb-1.5 block text-[13px] font-medium text-ui-default"
        htmlFor="sp-body"
      >
        Body
      </label>
      <BodyEditor
        onAiAction={onAiAction}
        id="sp-body"
        ariaLabel="Page body"
        value={state.body}
        onChange={(body) => set("body", body)}
        profile={{
          kind: "landing-page",
          startLinkType: state.linkType,
        }}
      />
    </div>
  );

  if (layout === "stacked") {
    return (
      <>
        {linkField}

        {titleField}

        {pathField}

        {categoryFields}

        {descriptionField}

        {visibilityField}

        {bodyField}
      </>
    );
  }
  return (
    <div className="flex items-start gap-8">
      <div className="min-w-0 flex-1">
        {titleField}
        {bodyField}
      </div>
      <aside className="sticky top-0 w-80 shrink-0 border-l border-ui-hairline pl-8">
        {linkField}
        {pathField}
        {categoryFields}
        {descriptionField}
        {visibilityField}
      </aside>
    </div>
  );
}
