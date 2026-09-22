import type {
  CalendarBlock,
  CollectionDefinition,
  DataTableBlock,
  Facet,
  FacetValue,
  FinderBlock,
  SortOption,
} from "@govtech-bb/block-kit";
import { COMPUTED_FACETS } from "@govtech-bb/block-kit";
import {
  CheckField,
  KeyListField,
  NumberField,
  Repeatable,
  SelectField,
  TextAreaField,
  TextField,
} from "../fields";

/**
 * The config block editors. Typed sub-forms over the block's JSONB, with a
 * repeatable list for facets, columns and sort options.
 *
 * Every field name here is a `key` from the selected collection's `schema`,
 * offered as a dropdown rather than typed free-hand — which is the only
 * reason validation rules 6 and 7 can be satisfied before save rather than
 * discovered at it.
 */

interface ConfigProps<T> {
  block: T;
  onChange: (block: T) => void;
  collections: CollectionDefinition[];
}

const collectionOptions = (collections: CollectionDefinition[]) => [
  { value: "", label: "— choose a collection —" },
  ...collections.map((c) => ({ value: c.key, label: `${c.title} (${c.key})` })),
];

const fieldsOf = (
  collections: CollectionDefinition[],
  key: string,
): CollectionDefinition["schema"]["fields"] =>
  collections.find((c) => c.key === key)?.schema.fields ?? [];

function FieldSelect({
  label,
  hint,
  value,
  fields,
  extra = [],
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  fields: CollectionDefinition["schema"]["fields"];
  extra?: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const options = [
    { value: "", label: "— choose a field —" },
    ...fields.map((f) => ({ value: f.key, label: `${f.label} (${f.key})` })),
    ...extra,
  ];
  // A value that no longer resolves must stay visible, or editing a
  // collection silently discards the configuration built against the old one.
  if (value && !options.some((o) => o.value === value)) {
    options.push({ value, label: `${value} — not a field of this collection` });
  }
  // Through SelectField so it is the design system's Select, like every
  // other control in the editor.
  return (
    <SelectField
      label={label}
      hint={hint}
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}

/* ------------------------------------------------------------- finder */

function FacetEditor({
  facet,
  onChange,
  collections,
  collectionKey,
}: {
  facet: Facet;
  onChange: (facet: Facet) => void;
  collections: CollectionDefinition[];
  collectionKey: string;
}) {
  const fields = fieldsOf(collections, collectionKey);
  const computed = Array.isArray(facet.computed_from)
    ? facet.computed_from
    : facet.computed_from
      ? [facet.computed_from]
      : [];
  const hasPredicate = facet.key in COMPUTED_FACETS;

  return (
    <div className="ed-stack">
      <div className="ed-row">
        <TextField
          label="Key"
          hint="Matches a field, or a shipped predicate."
          value={facet.key}
          onChange={(key) => onChange({ ...facet, key })}
        />
        <TextField
          label="Label"
          value={facet.name}
          onChange={(name) => onChange({ ...facet, name })}
        />
        <SelectField
          label="Control"
          value={facet.type}
          options={[
            { value: "checkbox", label: "Checkboxes" },
            { value: "radio", label: "Radios" },
          ]}
          onChange={(type) => onChange({ ...facet, type })}
        />
      </div>

      <p className={hasPredicate ? "ed-note ed-note-ok" : "ed-note"}>
        {hasPredicate
          ? `"${facet.key}" has a developer-shipped predicate — it filters on more than one field.`
          : `"${facet.key}" has no shipped predicate, so it matches on the field value directly.`}
      </p>

      <KeyListField
        label="Computed from"
        hint="Fields the predicate reads. Required when the key is not itself a field (rule 6)."
        value={computed}
        onChange={(keys) =>
          onChange({
            ...facet,
            computed_from: keys.length === 0 ? undefined : keys,
          })
        }
      />

      <div className="ed-row">
        <SelectField
          label="Options from"
          hint="Draw the choices from another collection's records."
          value={facet.allowed_values_from ?? ""}
          options={[
            { value: "", label: "— list them below —" },
            ...collections.map((c) => ({ value: c.key, label: c.key })),
          ]}
          onChange={(key) =>
            onChange({ ...facet, allowed_values_from: key || undefined })
          }
        />
        <CheckField
          label="Scrollable group"
          checked={facet.large ?? false}
          onChange={(large) =>
            onChange({ ...facet, large: large || undefined })
          }
        />
      </div>

      {facet.allowed_values_from ? null : (
        <Repeatable<FacetValue>
          legend="Options"
          items={facet.allowed_values ?? []}
          onChange={(allowed_values) => onChange({ ...facet, allowed_values })}
          create={() => ({ value: "", label: "" })}
          itemLabel={(option) => option.label || option.value || "New option"}
          renderItem={(option, update) => (
            <div className="ed-row">
              <TextField
                label="Value"
                value={option.value}
                onChange={(value) => update({ ...option, value })}
              />
              <TextField
                label="Label"
                value={option.label}
                onChange={(label) => update({ ...option, label })}
              />
              <CheckField
                label="Selected by default"
                checked={option.default ?? false}
                onChange={(on) =>
                  update({ ...option, default: on || undefined })
                }
              />
            </div>
          )}
        />
      )}

      <p className="ed-field-hint">
        Fields available: {fields.map((f) => f.key).join(", ") || "none"}
      </p>
    </div>
  );
}

export function FinderEditor({
  block,
  onChange,
  collections,
}: ConfigProps<FinderBlock>) {
  const fields = fieldsOf(collections, block.collection);

  return (
    <div className="ed-stack">
      <div className="ed-row">
        <SelectField
          label="Collection"
          hint="Must exist in data_collections (rule 5)."
          value={block.collection}
          options={collectionOptions(collections)}
          onChange={(collection) => onChange({ ...block, collection })}
        />
        <TextField
          label="Noun for one result"
          value={block.document_noun}
          onChange={(document_noun) => onChange({ ...block, document_noun })}
        />
        <NumberField
          label="Results per page"
          value={block.results_per_page}
          min={1}
          max={200}
          onChange={(results_per_page) =>
            onChange({ ...block, results_per_page })
          }
        />
      </div>

      <TextAreaField
        label="Empty state message"
        value={block.empty_message}
        onChange={(empty_message) => onChange({ ...block, empty_message })}
      />

      <fieldset className="ed-repeatable">
        <legend>Search</legend>
        <CheckField
          label="Show a search box"
          checked={block.search.enabled}
          onChange={(enabled) =>
            onChange({ ...block, search: { ...block.search, enabled } })
          }
        />
        {block.search.enabled ? (
          <>
            <TextField
              label="Search label"
              value={block.search.label}
              onChange={(label) =>
                onChange({ ...block, search: { ...block.search, label } })
              }
            />
            <KeyListField
              label="Fields searched"
              hint="Each must be a field of the collection (rule 7)."
              value={block.search.fields}
              onChange={(searchFields) =>
                onChange({
                  ...block,
                  search: { ...block.search, fields: searchFields },
                })
              }
            />
          </>
        ) : null}
      </fieldset>

      <Repeatable<Facet>
        legend="Facets"
        items={block.facets}
        onChange={(facets) => onChange({ ...block, facets })}
        create={() => ({ key: "", name: "New filter", type: "checkbox" })}
        itemLabel={(facet) => facet.name || facet.key || "New facet"}
        renderItem={(facet, update) => (
          <FacetEditor
            facet={facet}
            onChange={update}
            collections={collections}
            collectionKey={block.collection}
          />
        )}
      />

      <Repeatable<SortOption>
        legend="Sort options"
        items={block.sort}
        onChange={(sort) => onChange({ ...block, sort })}
        create={() => ({ key: "", name: "" })}
        itemLabel={(option) => option.name || option.key || "New sort"}
        renderItem={(option, update) => (
          <div className="ed-row">
            <TextField
              label="Key"
              value={option.key}
              onChange={(key) => update({ ...option, key })}
            />
            <TextField
              label="Label"
              value={option.name}
              onChange={(name) => update({ ...option, name })}
            />
            <CheckField
              label="Default"
              checked={option.default ?? false}
              onChange={(on) => update({ ...option, default: on || undefined })}
            />
            <CheckField
              label="Needs geolocation"
              checked={option.requires === "geolocation"}
              onChange={(on) =>
                update({ ...option, requires: on ? "geolocation" : undefined })
              }
            />
          </div>
        )}
      />

      <fieldset className="ed-repeatable">
        <legend>Result card</legend>
        <FieldSelect
          label="Title field"
          value={block.result_template.title}
          fields={fields}
          onChange={(title) =>
            onChange({
              ...block,
              result_template: { ...block.result_template, title },
            })
          }
        />
        <KeyListField
          label="Metadata shown"
          hint="Fields of the collection, or the key of a facet on this block (rule 7)."
          value={block.result_template.metadata}
          onChange={(metadata) =>
            onChange({
              ...block,
              result_template: { ...block.result_template, metadata },
            })
          }
        />
        <TextField
          label="Detail URL"
          hint="{slug} is replaced with the record's field of that name."
          value={block.result_template.detail_url}
          onChange={(detail_url) =>
            onChange({
              ...block,
              result_template: { ...block.result_template, detail_url },
            })
          }
        />
      </fieldset>
    </div>
  );
}

/* ----------------------------------------------------------- calendar */

export function CalendarEditor({
  block,
  onChange,
  collections,
}: ConfigProps<CalendarBlock>) {
  const fields = fieldsOf(collections, block.collection);

  return (
    <div className="ed-stack">
      <div className="ed-row">
        <SelectField
          label="Rules collection"
          value={block.collection}
          options={collectionOptions(collections)}
          onChange={(collection) => onChange({ ...block, collection })}
        />
        <NumberField
          label="From year"
          value={block.year_range.min}
          onChange={(min) =>
            onChange({ ...block, year_range: { ...block.year_range, min } })
          }
        />
        <NumberField
          label="To year"
          value={block.year_range.max}
          onChange={(max) =>
            onChange({ ...block, year_range: { ...block.year_range, max } })
          }
        />
      </div>

      <SelectField
        label="Substitution policy"
        hint="The per-holiday trigger is data on each rule row; this selects which policy reads it."
        value={block.substitution_rule}
        options={[
          { value: "cap-352", label: "Public Holidays Act, Cap. 352" },
          { value: "next-working-day", label: "Next working day (naive)" },
          { value: "none", label: "No substitutions" },
        ]}
        onChange={(substitution_rule) =>
          onChange({ ...block, substitution_rule })
        }
      />

      <CheckField
        label="Show holidays that have already passed"
        checked={block.show_past}
        onChange={(show_past) => onChange({ ...block, show_past })}
      />

      <Repeatable<CalendarBlock["columns"][number]>
        legend="Columns"
        items={block.columns}
        onChange={(columns) => onChange({ ...block, columns })}
        create={() => ({ field: "name", label: "Holiday" })}
        itemLabel={(column) => column.label || column.field}
        renderItem={(column, update) => (
          <div className="ed-row">
            <FieldSelect
              label="Field"
              value={column.field}
              fields={fields}
              // `date` is computed from the rule and never stored on the row.
              extra={[{ value: "date", label: "Date (computed)" }]}
              onChange={(field) => update({ ...column, field })}
            />
            <TextField
              label="Heading"
              value={column.label}
              onChange={(label) => update({ ...column, label })}
            />
            <SelectField
              label="Format"
              value={column.format ?? "long_date"}
              options={[
                { value: "long_date", label: "Monday, 1 January 2026" },
                { value: "short_date", label: "1 Jan 2026" },
              ]}
              onChange={(format) => update({ ...column, format })}
            />
          </div>
        )}
      />
    </div>
  );
}

/* --------------------------------------------------------- data table */

export function DataTableEditor({
  block,
  onChange,
  collections,
}: ConfigProps<DataTableBlock> & { refKeys: string[] }) {
  return (
    <div className="ed-stack">
      <p className="ed-note">
        Not used by any of the three spiked pages. It is here as the control
        case: if the config-block pattern only worked for the finder and the
        calendar, it would be two bespoke forms, not a pattern.
      </p>
      <TextField
        label="Source ref"
        hint="A key in body.refs holding a record or query ref (rule 4)."
        value={block.source}
        onChange={(source) => onChange({ ...block, source })}
      />
      <TextAreaField
        label="Empty state message"
        value={block.empty_message}
        onChange={(empty_message) => onChange({ ...block, empty_message })}
      />
      <Repeatable<DataTableBlock["columns"][number]>
        legend="Columns"
        items={block.columns}
        onChange={(columns) => onChange({ ...block, columns })}
        create={() => ({ field: "", label: "" })}
        itemLabel={(column) => column.label || column.field || "New column"}
        renderItem={(column, update) => (
          <div className="ed-row">
            <TextField
              label="Field"
              value={column.field}
              onChange={(field) => update({ ...column, field })}
            />
            <TextField
              label="Heading"
              value={column.label}
              onChange={(label) => update({ ...column, label })}
            />
          </div>
        )}
      />
      <p className="ed-field-hint">
        Collections available: {collections.map((c) => c.key).join(", ")}
      </p>
    </div>
  );
}
