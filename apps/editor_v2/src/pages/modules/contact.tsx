import { AddressBook, ArrowSquareOut, Warning } from "@phosphor-icons/react";
import { contactBlockFor, contactDetails } from "@govtech-bb/block-kit/contact";
import { DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PageHandler, PageModule } from "../definition";
import { UnsupportedPageContent } from "../markdown";
import { pageInsertAction } from "../insertion";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Field, FieldGroup } from "../../ui/field";
import { NativeSelect } from "../../ui/native-select";

/**
 * Contact details read from a record of a data collection (#3185), written
 * `::contact{collection="contacts" record="barbados-drug-service" fields="phone,email,hours"}`. The page keeps its own
 * heading and wording around it; the details are the record's, so changing the record changes every page showing it.
 */

/** A collection and its records, as api_v2's public `GET /collections/:key/records` answers. */
export type CollectionRecords = {
  collection: {
    key: string;
    title: string;
    record_key: string;
    schema: { fields: readonly { key: string; label: string }[] };
  };
  records: readonly { record_key: string; data: Readonly<Record<string, string>> }[];
};

/** What the host lets a contact block read and open; without a host, blocks show which record they name. */
export type PageCollections = {
  /** The collection, or null when there is no such collection. */
  read: (key: string) => Promise<CollectionRecords | null>;
  /** Opens the record's editing, such as the collection's screen. */
  openRecord?: (collection: string, record: string) => void;
};

const PageCollectionsContext = createContext<PageCollections | null>(null);

export function PageCollectionsProvider({
  collections,
  children,
}: {
  collections: PageCollections;
  children: ReactNode;
}) {
  return <PageCollectionsContext value={collections}>{children}</PageCollectionsContext>;
}

export const usePageCollections = () => useContext(PageCollectionsContext);

type CollectionState =
  | { status: "unavailable" | "loading" | "failed" }
  | { status: "read"; value: CollectionRecords | null };

/** A collection as the host reads it, read again when the block names another. */
export function useCollection(key: string): CollectionState {
  const host = usePageCollections();
  const [state, setState] = useState<{ key: string; state: CollectionState }>();

  useEffect(() => {
    if (!host || !key) return;
    let current = true;
    host.read(key).then(
      (value) => current && setState({ key, state: { status: "read", value } }),
      () => current && setState({ key, state: { status: "failed" } }),
    );

    return () => {
      current = false;
    };
  }, [host, key]);

  if (!host || !key) return { status: "unavailable" };

  return state?.key === key ? state.state : { status: "loading" };
}

/** The record a block names, from a read collection; undefined when it has gone. */
export const findRecord = (collection: CollectionRecords, record: string) =>
  collection.records.find((row) => row.record_key === record);

export type ContactSettings = { collection: string; record: string; fields: readonly string[] };

/** The record's details, as the page shows them: a warning when the record has gone. */
export function ContactPreview({ collection, record, fields }: ContactSettings) {
  const state = useCollection(collection);

  const status = (children: ReactNode, warning = false) => (
    <div
      className={warning ? "page-contact page-contact-warning" : "page-contact"}
      role={warning ? "alert" : undefined}
    >
      {warning && <Warning aria-hidden="true" />}
      <p>{children}</p>
    </div>
  );

  if (!record) return status("Choose the contact record to show, in Block options.");

  if (state.status !== "read")
    return state.status === "unavailable"
      ? status(`Contact details from “${record}”`)
      : state.status === "loading"
        ? status("Loading contact details…")
        : status("The contact details couldn't be loaded.", true);
  const { value } = state;
  const found = value && findRecord(value, record);

  if (!value || !found)
    return status(
      `There's no contact record “${record}” in ${value?.collection.title ?? collection}. The page won't show these contact details: choose another record, or delete this block.`,
      true,
    );

  const details = contactDetails(contactBlockFor(value.collection, record, fields), found.data);

  if (!details.length) return status("This record has none of the chosen details.", true);

  return (
    <div className="page-contact page-contacts" aria-label="Contact details">
      {details.map(({ field, label, text, href }) =>
        href ? (
          <a key={field} className="page-contact-tile" href={href}>
            <span>{label}</span>
            <strong>{text}</strong>
          </a>
        ) : (
          <div key={field} className="page-contact-tile">
            <span>{label}</span>
            <strong>{text}</strong>
          </div>
        ),
      )}
    </div>
  );
}

type SerializedPageContact = SerializedLexicalNode & ContactSettings;

export class PageContactNode extends DecoratorNode<ReactNode> {
  __collection: string;
  __record: string;
  __fields: readonly string[];
  static override getType() {
    return "page-contact";
  }
  static override clone(node: PageContactNode) {
    return new PageContactNode(node.getSettings(), node.__key);
  }
  constructor(
    settings: ContactSettings = { collection: "contacts", record: "", fields: [] },
    key?: NodeKey,
  ) {
    super(key);
    this.__collection = settings.collection;
    this.__record = settings.record;
    this.__fields = [...settings.fields];
  }
  static override importJSON(value: SerializedPageContact) {
    return new PageContactNode(value).updateFromJSON(value);
  }
  override exportJSON(): SerializedPageContact {
    return { ...super.exportJSON(), type: "page-contact", version: 1, ...this.getSettings() };
  }
  getSettings(): ContactSettings {
    const self = this.getLatest();

    return { collection: self.__collection, record: self.__record, fields: [...self.__fields] };
  }
  setSettings(settings: Partial<ContactSettings>) {
    const self = this.getWritable();

    if (settings.collection !== undefined) self.__collection = settings.collection;

    if (settings.record !== undefined) self.__record = settings.record;

    if (settings.fields !== undefined) self.__fields = [...settings.fields];
  }
  override createDOM() {
    const element = document.createElement("div");
    element.className = "page-contact-block";
    element.contentEditable = "false";

    return element;
  }
  override updateDOM() {
    return false;
  }
  override isInline() {
    return false;
  }
  override decorate() {
    return <ContactPreview {...this.getSettings()} />;
  }
}

export const $isPageContactNode = (node: LexicalNode | null | undefined): node is PageContactNode =>
  node instanceof PageContactNode;

const ATTRIBUTES = ["collection", "record", "fields"];

function contactSettings(node: Parameters<PageHandler["$import"]>[0]): ContactSettings {
  if (node.type !== "leafDirective" || node.name !== "contact")
    throw new UnsupportedPageContent(node);
  const data = node.attributes ?? {};

  const fields = (data.fields ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  // Only the form the block saves in, so opening and saving never rewrites a block nobody touched
  if (
    node.children.length ||
    Object.keys(data).join() !== ATTRIBUTES.join() ||
    !data.collection ||
    fields.join(",") !== data.fields
  )
    throw new UnsupportedPageContent(node, "This contact block needs Markdown source editing");

  return { collection: data.collection, record: data.record ?? "", fields };
}

const contact: PageHandler = {
  accepts: (node) => node.type === "leafDirective" && node.name === "contact",
  owns: $isPageContactNode,
  $import: (node) => [new PageContactNode(contactSettings(node))],
  $export(node) {
    if (!$isPageContactNode(node)) throw new Error("Expected a contact block");
    const { collection, record, fields } = node.getSettings();

    return [
      {
        type: "leafDirective",
        name: "contact",
        attributes: { collection, record, fields: fields.join(",") },
        children: [],
      },
    ];
  },
  render: (node, _, key) => <ContactPreview key={key} {...contactSettings(node)} />,
};

/** Block options for a contact block: its record, the details to show, and the way to change the record. */
export function ContactBlockSettings({
  settings,
  onChange,
}: {
  settings: ContactSettings;
  onChange: (settings: Partial<ContactSettings>) => void;
}) {
  const state = useCollection(settings.collection);
  const host = usePageCollections();
  const [record, setRecord] = useState(settings.record);
  const [fields, setFields] = useState<readonly string[]>(settings.fields);
  const [error, setError] = useState<string>();
  const collection = state.status === "read" ? state.value : null;

  const choices = [...(collection?.records ?? [])].sort((a, b) =>
    (a.data.name ?? a.record_key).localeCompare(b.data.name ?? b.record_key),
  );

  const detailFields =
    collection?.collection.schema.fields.filter(
      (field) => field.key !== collection.collection.record_key,
    ) ?? [];

  return (
    <form
      className="page-component-settings grid gap-4 border-b border-line px-3.5 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();

        if (!record) return setError("Choose a contact record.");

        if (!fields.length) return setError("Choose at least one detail to show.");
        setError(undefined);
        onChange({ record, fields });
      }}
    >
      <Field size="sm" label="Contact record">
        <NativeSelect
          size="sm"
          value={record}
          disabled={!collection}
          onChange={(event) => setRecord(event.target.value)}
        >
          <option value="">
            {state.status === "loading" ? "Loading records…" : "Choose a record"}
          </option>
          {/* A record that has gone stays listed, so the block's choice is still shown */}
          {record && collection && !findRecord(collection, record) && (
            <option value={record}>{record} (missing)</option>
          )}
          {choices.map((row) => (
            <option key={row.record_key} value={row.record_key}>
              {row.data.name ?? row.record_key}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {detailFields.length > 0 && (
        <FieldGroup label="Details to show">
          {detailFields.map((field) => (
            <Checkbox
              key={field.key}
              label={field.label}
              checked={fields.includes(field.key)}
              onCheckedChange={(checked) =>
                setFields(
                  // In the collection's order, whatever order they're ticked in
                  detailFields
                    .map((item) => item.key)
                    .filter((key) => (key === field.key ? checked : fields.includes(key))),
                )
              }
            />
          ))}
        </FieldGroup>
      )}
      {state.status === "failed" && (
        <p className="text-error" role="alert">
          The contact records couldn't be loaded.
        </p>
      )}
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary">
          Apply settings
        </Button>
        {host?.openRecord && settings.record && (
          <Button
            type="button"
            variant="ghost"
            icon={<ArrowSquareOut />}
            onClick={() => host.openRecord?.(settings.collection, settings.record)}
          >
            Open the record to change it
          </Button>
        )}
      </div>
    </form>
  );
}

export function PageContactModule(): PageModule {
  return {
    key: "page-contact",
    requires: ["text"],
    nodes: [{ type: "page-contact", node: PageContactNode }],
    markdown: [contact],
    actions: [
      pageInsertAction(
        "page-contact",
        "Contact details",
        () =>
          new PageContactNode({
            collection: "contacts",
            record: "",
            fields: ["phone", "email", "hours"],
          }),
        {
          group: "Components",
          order: 40,
          icon: <AddressBook />,
          description: "Show an organisation's contact details, kept up to date from its record.",
          aliases: ["contacts", "phone", "telephone", "email", "opening hours", "address"],
        },
      ),
    ],
  };
}
