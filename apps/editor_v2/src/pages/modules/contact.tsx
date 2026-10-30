import { AddressBook, ArrowRight, Warning } from "@phosphor-icons/react";
import { contactBlockFor, contactDetails } from "@govtech-bb/block-kit/contact";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { OPEN_BLOCK_OPTIONS_COMMAND } from "../block-options";
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

type CollectionState =
  | { status: "unavailable" | "loading" | "failed" }
  | { status: "read"; value: CollectionRecords | null };

/**
 * The page's latest read of each collection. Every block and Block options showing a collection share it, so a read
 * made as the options open, which may find a record added since, updates the blocks too.
 */
function collectionStore(host: PageCollections) {
  const states = new Map<string, CollectionState>();
  const latest = new Map<string, number>();
  const listeners = new Set<() => void>();
  let reads = 0;

  return {
    host,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    get: (key: string) => states.get(key),
    read(key: string) {
      const read = ++reads;
      latest.set(key, read);

      const settle = (state: CollectionState) => {
        // An earlier read answering late never replaces a later one
        if (latest.get(key) !== read) return;
        states.set(key, state);
        listeners.forEach((listener) => listener());
      };

      host.read(key).then(
        (value) => settle({ status: "read", value }),
        () => settle({ status: "failed" }),
      );
    },
  };
}

const PageCollectionsContext = createContext<ReturnType<typeof collectionStore> | null>(null);

export function PageCollectionsProvider({
  collections,
  children,
}: {
  collections: PageCollections;
  children: ReactNode;
}) {
  const store = useMemo(() => collectionStore(collections), [collections]);

  return <PageCollectionsContext value={store}>{children}</PageCollectionsContext>;
}

export const usePageCollections = () => useContext(PageCollectionsContext)?.host ?? null;

const NO_STORE = () => () => {};

/** A collection as the host last read it, read again whenever a block or its options showing it appear. */
export function useCollection(key: string): CollectionState {
  const store = useContext(PageCollectionsContext);

  const state = useSyncExternalStore(store?.subscribe ?? NO_STORE, () =>
    key ? store?.get(key) : undefined,
  );

  useEffect(() => {
    if (store && key) store.read(key);
  }, [store, key]);

  if (!store || !key) return { status: "unavailable" };

  return state ?? { status: "loading" };
}

/** The record a block names, from a read collection; undefined when it has gone. */
export const findRecord = (collection: CollectionRecords, record: string) =>
  collection.records.find((row) => row.record_key === record);

export type ContactSettings = { collection: string; record: string; fields: readonly string[] };

/**
 * The record's details, as the page shows them: a warning when the record has gone. Before a record is chosen it says
 * so, and `onChoose`, where the block can be changed, is the button that chooses one.
 */
export function ContactPreview({
  collection,
  record,
  fields,
  onChoose,
}: ContactSettings & { onChoose?: () => void }) {
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

  // Not set up yet, which is no problem: what it still needs, and the button that chooses it
  const unset = (need: string, action: string) =>
    onChoose ? (
      <div className="page-contact page-contact-empty">
        <p>{need}</p>
        <Button variant="secondary" onClick={onChoose}>
          {action}
        </Button>
      </div>
    ) : (
      status(need)
    );

  if (!record) return unset("Choose the contact record this block shows.", "Choose a record");

  if (!fields.length) return unset("Choose the details this block shows.", "Choose details");

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

  // The site links what can be linked. In the editor nothing is, so a press on a tile stays on the page being edited
  // and the tiles take no Tab stops in the text
  return (
    <div className="page-contact page-contacts" role="group" aria-label="Contact details">
      {details.map(({ field, label, text }) => (
        <div key={field} className="page-contact-tile">
          <span>{label}</span>
          <strong>{text}</strong>
        </div>
      ))}
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
    return <PageContactBlock nodeKey={this.__key} {...this.getSettings()} />;
  }
}

// Blocks just inserted from a menu, which open their Block options once they're on the page
const inserted = new Set<NodeKey>();

/** A contact block on the page, which asks for its Block options when it has no record to show. */
function PageContactBlock({ nodeKey, ...settings }: ContactSettings & { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const wrapper = useRef<HTMLDivElement>(null);
  const choose = () => editor.dispatchCommand(OPEN_BLOCK_OPTIONS_COMMAND, nodeKey);

  // Just inserted, it has no record yet: its Block options open, to choose one. Deleted when it fires, not before,
  // so a remount in between still opens them
  useEffect(() => {
    if (!inserted.has(nodeKey)) return;

    const timer = setTimeout(() => {
      inserted.delete(nodeKey);

      if (!settings.record) editor.dispatchCommand(OPEN_BLOCK_OPTIONS_COMMAND, nodeKey);
    });

    return () => clearTimeout(timer);
  }, [editor, nodeKey, settings.record]);

  // Keys pressed on its own button are the button's: the editor would otherwise take Enter for a new line
  useEffect(() => {
    const element = wrapper.current;
    const stop = (event: KeyboardEvent) => event.stopPropagation();

    element?.addEventListener("keydown", stop);

    return () => element?.removeEventListener("keydown", stop);
  }, []);

  return (
    <div ref={wrapper}>
      <ContactPreview {...settings} onChoose={editable ? choose : undefined} />
    </div>
  );
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

/**
 * Block options for a contact block: its record, the details to show, and the way to change the record. Each choice
 * applies as it's made, as the page's settings do, so closing the menu never drops one.
 */
export function ContactBlockSettings({
  settings,
  onChange,
}: {
  settings: ContactSettings;
  onChange: (settings: Partial<ContactSettings>) => void;
}) {
  const state = useCollection(settings.collection);
  const host = usePageCollections();
  const { record, fields } = settings;
  const collection = state.status === "read" ? state.value : null;
  const recordField = useRef<HTMLSelectElement>(null);
  const focused = useRef(false);

  // Without a record the block shows nothing, so choosing one comes first: the field takes the focus once it can
  // be used, as the records arrive
  useEffect(() => {
    if (focused.current || record || !collection) return;
    focused.current = true;
    recordField.current?.focus();
  }, [record, collection]);

  const choices = [...(collection?.records ?? [])].sort((a, b) =>
    (a.data.name ?? a.record_key).localeCompare(b.data.name ?? b.record_key),
  );

  const detailFields =
    collection?.collection.schema.fields.filter(
      (field) => field.key !== collection.collection.record_key,
    ) ?? [];

  return (
    <div className="page-component-settings grid gap-4 border-b border-line px-3.5 pt-2 pb-4">
      <Field size="sm" label="Contact record">
        <NativeSelect
          ref={recordField}
          size="sm"
          value={record}
          disabled={!collection}
          onChange={(event) => onChange({ record: event.target.value })}
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
                onChange({
                  // In the collection's order, whatever order they're ticked in
                  fields: detailFields
                    .map((item) => item.key)
                    .filter((key) => (key === field.key ? checked : fields.includes(key))),
                })
              }
            />
          ))}
        </FieldGroup>
      )}
      {detailFields.length > 0 && !fields.length && (
        <p className="-mt-2 text-14 text-muted">Nothing shows until you choose one.</p>
      )}
      {state.status === "failed" && (
        <p className="text-error" role="alert">
          The contact records couldn't be loaded.
        </p>
      )}
      {host?.openRecord && record && (
        <div>
          <Button
            variant="ghost"
            icon={<ArrowRight />}
            onClick={() => host.openRecord?.(settings.collection, record)}
          >
            Open the record to change it
          </Button>
        </div>
      )}
    </div>
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
        () => {
          const node = new PageContactNode({
            collection: "contacts",
            record: "",
            fields: ["phone", "email", "hours"],
          });

          inserted.add(node.getKey());

          return node;
        },
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
