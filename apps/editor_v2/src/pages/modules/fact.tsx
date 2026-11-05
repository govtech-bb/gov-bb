import { ArrowRight, Database, Warning } from "@phosphor-icons/react";
import { recordDetails } from "@govtech-bb/govbbmarkd/record-details";
import { $isLinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $addUpdateTag,
  $getNodeByKey,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  HISTORY_PUSH_TAG,
  KEY_ENTER_COMMAND,
  SKIP_SELECTION_FOCUS_TAG,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../cn";
import { Button } from "../../ui/button";
import { Field } from "../../ui/field";
import { Input } from "../../ui/input";
import { NativeSelect } from "../../ui/native-select";
import { Popover } from "../../ui/popover";
import { referenceChip } from "../../ui/reference-chip";
import { $parseDirective } from "../blocks/define-block";
import { $hasTrait } from "../blocks/node";
import type { PageHandler, PageModule } from "../definition";
import { findRecord, useCollection, usePageCollections } from "../page-collections";

/**
 * One fact from a data collection's record (#3590), in a line of text, written
 * `:fact[fallback]{collection="contacts" record="barbados-drug-service" field="phone"}`. The value is the record's, so
 * changing the record changes every page that shows it. The fallback shows in its place if the record or field has
 * gone.
 */

/** Which value a fact shows, and what shows in its place if it has gone. */
export type FactSettings = { collection: string; record: string; field: string; fallback: string };

type SerializedPageFact = SerializedLexicalNode & FactSettings;

export class PageFactNode extends DecoratorNode<ReactNode> {
  __settings: FactSettings;
  static override getType() {
    return "page-fact";
  }
  static override clone(node: PageFactNode) {
    return new PageFactNode(node.__settings, node.__key);
  }
  constructor(
    settings: FactSettings = { collection: "contacts", record: "", field: "", fallback: "" },
    key?: NodeKey,
  ) {
    super(key);
    this.__settings = { ...settings };
  }
  static override importJSON(value: SerializedPageFact) {
    const { collection, record, field, fallback } = value;

    return new PageFactNode({ collection, record, field, fallback }).updateFromJSON(value);
  }
  override exportJSON(): SerializedPageFact {
    return { ...super.exportJSON(), type: "page-fact", version: 1, ...this.getSettings() };
  }
  getSettings(): FactSettings {
    return { ...this.getLatest().__settings };
  }
  setSettings(settings: Partial<FactSettings>) {
    const self = this.getWritable();
    self.__settings = { ...self.__settings, ...settings };
  }
  override createDOM() {
    return document.createElement("span");
  }
  override updateDOM() {
    return false;
  }
  override isInline() {
    return true;
  }
  /** The text copied or searched: the fallback, as the value is the host's to read. */
  override getTextContent() {
    return this.getLatest().__settings.fallback;
  }
  override decorate() {
    return <FactChip nodeKey={this.__key} {...this.getSettings()} />;
  }
}

export const $isPageFactNode = (node: LexicalNode | null | undefined): node is PageFactNode =>
  node instanceof PageFactNode;

/** What a fact shows in the editor: its value, as the page shows it, or why it can't. */
type Shown = { text: string; label: string; tone: "value" | "pending" | "warning" };

const instead = (fallback: string) =>
  fallback ? `The page shows “${fallback}” instead.` : "The page shows nothing here.";

function useFactShown({ collection: key, record, field, fallback }: FactSettings): Shown {
  const state = useCollection(key);
  const named = `the ${field} of ${record}`;

  if (!record || !field)
    return { text: "Choose a fact", label: "A fact still to be chosen", tone: "pending" };

  if (state.status === "unavailable")
    return { text: fallback || named, label: `${named}, from ${key}`, tone: "value" };

  if (state.status === "loading")
    return { text: fallback || "…", label: "Loading the fact", tone: "pending" };

  // Failed: the collection couldn't be read
  if (state.status !== "read")
    return {
      text: fallback || named,
      label: "The collection couldn't be loaded.",
      tone: "warning",
    };

  const collection = state.value;

  if (!collection)
    return {
      text: fallback || named,
      label: `There's no collection “${key}”. ${instead(fallback)}`,
      tone: "warning",
    };

  const { title } = collection.collection;
  const row = findRecord(collection, record);

  if (!row)
    return {
      text: fallback || record,
      label: `There's no record “${record}” in ${title}. ${instead(fallback)}`,
      tone: "warning",
    };

  const name = row.data.name ?? record;
  const [detail] = recordDetails(collection.collection, [field], row.data);

  if (!detail) {
    const label = collection.collection.schema.fields.find((item) => item.key === field)?.label;

    return {
      text: fallback || named,
      label: `${name} has no ${label ?? `“${field}”`}. ${instead(fallback)}`,
      tone: "warning",
    };
  }

  return { text: detail.text, label: `${detail.label} of ${name}, from ${title}`, tone: "value" };
}

// Facts whose picker opens once they're on the page: one just inserted, or one selected when Enter is pressed
const requested = new Set<NodeKey>();

const requestListeners = new Set<() => void>();

function requestPicker(key: NodeKey) {
  requested.add(key);
  requestListeners.forEach((listener) => listener());
}

/** A fact in the text: its value, as the page shows it. Pressed, it opens its picker. */
function FactChip({ nodeKey, ...settings }: FactSettings & { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const shown = useFactShown(settings);

  useEffect(() => {
    const check = () => {
      if (requested.delete(nodeKey)) setOpen(true);
    };

    check();
    requestListeners.add(check);

    return () => {
      requestListeners.delete(check);
    };
  }, [nodeKey]);

  // Keys pressed on the chip are the chip's: the editor would otherwise take Enter for a new line
  useEffect(() => {
    const element = chip.current;
    const stop = (event: KeyboardEvent) => event.stopPropagation();

    element?.addEventListener("keydown", stop);

    return () => element?.removeEventListener("keydown", stop);
  }, [editable]);

  // The picker's control keeps the focus. Choosing is a step to undo; typing a fallback merges into one
  const change = (patch: Partial<FactSettings>, typing = false) =>
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);

        if ($isPageFactNode(node)) node.setSettings(patch);
      },
      { tag: typing ? SKIP_SELECTION_FOCUS_TAG : [HISTORY_PUSH_TAG, SKIP_SELECTION_FOCUS_TAG] },
    );

  const look = cn(
    referenceChip,
    shown.tone === "warning" && "bg-red-10 text-red-80 hover:bg-red-10",
    shown.tone === "pending" &&
      "bg-transparent text-muted outline-1 outline-line outline-dashed hover:bg-transparent",
  );

  const content = (
    <>
      {shown.tone === "warning" && (
        <Warning aria-hidden="true" className="me-0.5 inline size-3.5 align-[-2px]" />
      )}
      {shown.text}
    </>
  );

  if (!editable)
    return (
      <span className={look} title={shown.label}>
        {content}
      </span>
    );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <button
            ref={chip}
            type="button"
            // Reached from the text by selecting it, as a word is, and opened with Enter: not a Tab stop of its own
            tabIndex={-1}
            className={look}
            title={shown.label}
            aria-label={`${shown.label} Change the fact.`}
          />
        }
      >
        {content}
      </Popover.Trigger>
      <Popover.Content
        aria-label="Fact from a collection"
        // Closing goes back to the writing, just after the fact
        finalFocus={() => {
          editor.update(() => $getNodeByKey(nodeKey)?.selectNext());
          editor.focus();

          return false;
        }}
        className="w-[min(20rem,calc(100vw-2rem))]"
      >
        <FactPicker settings={settings} onChange={change} />
      </Popover.Content>
    </Popover.Root>
  );
}

/** Chooses a fact: the collection, when the host has more than one, the record, its detail and the fallback. */
function FactPicker({
  settings,
  onChange,
}: {
  settings: FactSettings;
  onChange: (patch: Partial<FactSettings>, typing?: boolean) => void;
}) {
  const host = usePageCollections();
  const state = useCollection(settings.collection);
  const collection = state.status === "read" ? state.value : null;
  const [collections, setCollections] = useState<readonly { key: string; title: string }[]>([]);

  useEffect(() => {
    let live = true;

    // Unlisted, the collection in use stays the only one offered
    host?.list?.().then(
      (list) => {
        if (live) setCollections(list);
      },
      () => {},
    );

    return () => {
      live = false;
    };
  }, [host]);

  const records = [...(collection?.records ?? [])].sort((a, b) =>
    (a.data.name ?? a.record_key).localeCompare(b.data.name ?? b.record_key),
  );

  const fields =
    collection?.collection.schema.fields.filter(
      (field) => field.key !== collection.collection.record_key,
    ) ?? [];

  const loading = state.status === "loading" ? "Loading…" : undefined;

  return (
    <div className="grid gap-4 p-3.5">
      {collections.length > 1 && (
        <Field size="sm" label="Collection">
          <NativeSelect
            size="sm"
            value={settings.collection}
            onChange={(event) =>
              onChange({ collection: event.target.value, record: "", field: "" })
            }
          >
            {!collections.some((item) => item.key === settings.collection) && (
              <option value={settings.collection}>{settings.collection}</option>
            )}
            {collections.map((item) => (
              <option key={item.key} value={item.key}>
                {item.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field size="sm" label="Record">
        <NativeSelect
          size="sm"
          value={settings.record}
          disabled={!collection}
          onChange={(event) => onChange({ record: event.target.value })}
        >
          <option value="">{loading ?? "Choose a record"}</option>
          {/* A record that has gone stays listed, so the fact's choice is still shown */}
          {settings.record && collection && !findRecord(collection, settings.record) && (
            <option value={settings.record}>{settings.record} (missing)</option>
          )}
          {records.map((row) => (
            <option key={row.record_key} value={row.record_key}>
              {row.data.name ?? row.record_key}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field size="sm" label="Detail">
        <NativeSelect
          size="sm"
          value={settings.field}
          disabled={!collection}
          onChange={(event) => onChange({ field: event.target.value })}
        >
          <option value="">{loading ?? "Choose a detail"}</option>
          {settings.field &&
            collection &&
            !fields.some((field) => field.key === settings.field) && (
              <option value={settings.field}>{settings.field} (missing)</option>
            )}
          {fields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field size="sm" label="If it's gone, show" hint="Optional. Without it, nothing shows.">
        <Input
          value={settings.fallback}
          onValueChange={(value) => onChange({ fallback: value }, true)}
        />
      </Field>
      {state.status === "failed" && (
        <p className="text-error" role="alert">
          The collection couldn't be loaded.
        </p>
      )}
      {host?.openRecord && settings.record && (
        <div>
          <Button
            variant="ghost"
            icon={<ArrowRight />}
            onClick={() => host.openRecord?.(settings.collection, settings.record)}
          >
            Open the record to change it
          </Button>
        </div>
      )}
    </div>
  );
}

const fact: PageHandler = {
  accepts: (node) => node.type === "textDirective" && node.name === "fact",
  owns: $isPageFactNode,
  $import(node) {
    const { collection, record, field, fallback } = $parseDirective(node, "fact");

    return [new PageFactNode({ collection, record, field, fallback })];
  },
  $export(node) {
    if (!$isPageFactNode(node)) throw new Error("Expected a fact");
    const { collection, record, field, fallback } = node.getSettings();

    return [
      {
        type: "textDirective",
        name: "fact",
        attributes: { collection, record, field },
        children: fallback ? [{ type: "text", value: fallback }] : [],
      },
    ];
  },
};

/** Whether the caret is in text a fact can go in: not a link's, as the fact may be a link, nor a button's label. */
function $factFits() {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return false;
  const node = selection.anchor.getNode();

  return ![node, ...node.getParents()].some(
    (parent) => $isLinkNode(parent) || $hasTrait(parent, "button"),
  );
}

export function PageFactModule(): PageModule {
  return {
    key: "page-fact",
    requires: ["text"],
    nodes: [{ type: "page-fact", node: PageFactNode }],
    markdown: [fact],
    actions: [
      {
        id: "page-fact",
        title: "Fact from a collection",
        group: "Components",
        order: 41,
        icon: <Database />,
        description:
          "One detail from a record, such as an office's phone number, kept up to date in the text.",
        aliases: ["data", "collection", "detail", "phone", "telephone", "email", "address"],
        // From "/", at the caret: the insert menu puts blocks beside the rail's
        $available: ({ request }) => !request.mode && $factFits(),
        $execute() {
          $addUpdateTag(HISTORY_PUSH_TAG);
          const node = new PageFactNode();

          $insertNodes([node]);
          requestPicker(node.getKey());
        },
      },
    ],
    registrations: [
      {
        key: "page-fact-enter",
        phase: "browser",
        // Enter on a selected fact opens its picker
        register: (editor) =>
          editor.registerCommand(
            KEY_ENTER_COMMAND,
            (event) => {
              const selection = $getSelection();
              const [node] = $isNodeSelection(selection) ? selection.getNodes() : [];

              if (!$isPageFactNode(node) || !editor.isEditable()) return false;
              event?.preventDefault();
              requestPicker(node.getKey());

              return true;
            },
            COMMAND_PRIORITY_LOW,
          ),
      },
    ],
  };
}
