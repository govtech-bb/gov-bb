import { LANDING_CATEGORIES, VISIBILITY_LEVELS, type ViewLevel, type StartLinkType } from "./-lib";
import { BodyEditor } from "./-body-editor";
import { FormCombobox } from "./-form-combobox";
import type { EditorState } from "./-editor-state";
import type { FormDefinitionSummary } from "../../types/index";
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
}: {
  ed: EditorState;
  formOptions: FormDefinitionSummary[];
  layout: "stacked" | "wide";
}) {
  const { state, set, setState } = ed;

  const linkField = (
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-linktype">
        Start button links to
      </label>
      <select
        id="sp-linktype"
        className={s.select}
        value={state.linkType}
        onChange={(e) => set("linkType", e.target.value as StartLinkType)}
      >
        <option value="form">A form</option>
        <option value="slug">Another page (internal)</option>
        <option value="external">An external URL</option>
        <option value="none">No start button</option>
      </select>

      {state.linkType === "none" ? (
        <small className={s.help}>
          An informational page — any existing Start button is removed on
          deploy.
        </small>
      ) : state.linkType === "form" ? (
        <div className={s.subField}>
          {formOptions.length === 0 ? (
            <input
              className={s.input}
              type="text"
              value={state.formId}
              onChange={(e) => set("formId", e.target.value)}
              placeholder="form-id (e.g. get-birth-certificate)"
            />
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
          <input
            className={s.input}
            type="text"
            value={state.linkHref}
            onChange={(e) => set("linkHref", e.target.value)}
            placeholder={
              state.linkType === "slug"
                ? "/family-birth-relationships/get-birth-certificate"
                : "https://example.gov.bb/apply"
            }
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
      <input
        id="sp-title"
        className={s.input}
        type="text"
        value={state.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="Get a copy of a birth certificate"
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
      <label className={s.label}>File</label>
      <small className={s.fileNote}>{ed.fixedPath}</small>
      {collisionHelp}
    </div>
  ) : (
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-slug">
        Slug
      </label>
      <input
        id="sp-slug"
        className={s.input}
        type="text"
        value={state.slug}
        onChange={(e) => set("slug", e.target.value)}
        placeholder={state.formId || "page-slug"}
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
          <select
            id="sp-category"
            className={s.select}
            value={ed.creatingCategory ? "__new__" : state.category}
            onChange={(e) => {
              const v = e.target.value;
              ed.setCreatingCategory(v === "__new__");
              setState((cur) => ({
                ...cur,
                category: v === "__new__" ? "" : v,
                subcategory: "",
              }));
            }}
          >
            <option value="">No category</option>
            {LANDING_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
            <option value="__new__">＋ Create new category…</option>
          </select>
        </div>
        {ed.subcats.length > 0 && (
          <div className={s.field}>
            <label className={s.label} htmlFor="sp-subcategory">
              Subcategory
            </label>
            <select
              id="sp-subcategory"
              className={s.select}
              value={state.subcategory}
              onChange={(e) => set("subcategory", e.target.value)}
            >
              <option value="">None</option>
              {ed.subcats.map((sc) => (
                <option key={sc.slug} value={sc.slug}>
                  {sc.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {ed.creatingCategory && (
        <div className={s.field}>
          <label className={s.label} htmlFor="sp-newcat-title">
            New category name
          </label>
          <input
            id="sp-newcat-title"
            className={s.input}
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
          />
          <textarea
            className={`${s.textarea} ${s.subField}`}
            rows={2}
            value={ed.newCatDesc}
            onChange={(e) => ed.setNewCatDesc(e.target.value)}
            placeholder="Short description shown on the category page (optional)."
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
      <textarea
        id="sp-description"
        className={s.textarea}
        rows={2}
        value={state.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Short summary shown in category listings and search."
      />
    </div>
  );

  const visibilityField = (
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-visibility">
        Visibility
      </label>
      <select
        id="sp-visibility"
        className={s.select}
        value={state.visibility}
        onChange={(e) => set("visibility", e.target.value as ViewLevel)}
      >
        {VISIBILITY_LEVELS.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );

  const bodyField = (
    <div className={s.field}>
      <label className={s.label} htmlFor="sp-body">
        Body
      </label>
      <BodyEditor
        value={state.body}
        onChange={(body) => set("body", body)}
        linkType={state.linkType}
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
