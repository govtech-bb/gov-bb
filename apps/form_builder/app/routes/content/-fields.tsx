import { InputArea } from "../../components/ui/input/input-area";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import type { AssistantRequest } from "../../components/ui/ai/prompt-bar";
import {
  LANDING_CATEGORIES,
  VISIBILITY_LEVELS,
  type ViewLevel,
  type StartLinkType,
} from "./-lib";
import { BodyEditor } from "./-body-editor";
import { FormCombobox } from "./-form-combobox";
import type { EditorState } from "./-editor-state";
import type { BuilderFormSummary } from "../../types/index";
import s from "./-styles.module.css";

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
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-linktype">
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
        <small className={s.help}>
          An informational page — any existing Start button is removed on
          deploy.
        </small>
      ) : state.linkType === "form" ? (
        <div className={s.subField}>
          {formOptions.length === 0 ? (
            <>
              <label className={s.srOnly} htmlFor="sp-form-id">
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
            <small className={`${s.help} ${s.helpError}`}>
              No form “{state.formId}” in the builder — the Start button won’t
              render until it’s live on the forms manifest.
            </small>
          ) : !state.formId ? (
            <small className={s.help}>
              Choose the form this page’s Start button opens — required before
              deploying.
            </small>
          ) : null}
        </div>
      ) : (
        <div className={s.subField}>
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
          <small className={`${s.help} ${ed.hrefValid ? "" : s.helpError}`}>
            {state.linkType === "slug"
              ? "Internal path on alpha.gov.bb — must start with /."
              : "Full external URL — must start with https:// (or mailto:)."}
          </small>
        </div>
      )}
    </div>
  );

  const titleField = (
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-title">
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
    <small className={`${s.help} ${s.helpError}`}>
      {ed.collision === "exists"
        ? "A page already exists at this path — open it from the home screen instead."
        : "This collides with an existing page's URL (file vs folder/index)."}
    </small>
  );

  const pathField = ed.fixedPath ? (
    <div className={s.field}>
      <span className={s.label}>File</span>
      <small className={s.fileNote}>{ed.fixedPath}</small>
      {collisionHelp}
    </div>
  ) : (
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-slug">
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
        <small className={`${s.help} ${s.helpError}`}>
          Must be kebab-case (lowercase, hyphens).
        </small>
      ) : ed.collision ? (
        collisionHelp
      ) : ed.url ? (
        <small className={s.help}>URL: {ed.url}</small>
      ) : null}
    </div>
  );

  const categoryFields = (
    <>
      <div className={s.row}>
        <div className={s.field}>
          <label className={s.label} htmlFor="sp-category">
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
          <div className={s.field}>
            <label className={s.label} htmlFor="sp-subcategory">
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
        <div className={s.field}>
          <label className={s.label} htmlFor="sp-newcat-title">
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
            className={`${s.label} ${s.subField}`}
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
          <small className={s.help}>
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
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-description">
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
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-visibility">
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
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-body">
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
    <div className={s.wideGrid}>
      <div className={s.wideMain}>
        {titleField}
        {bodyField}
      </div>
      <aside className={s.wideRail}>
        {linkField}
        {pathField}
        {categoryFields}
        {descriptionField}
        {visibilityField}
      </aside>
    </div>
  );
}
