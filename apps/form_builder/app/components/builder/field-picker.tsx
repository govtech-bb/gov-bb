import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState } from "react";
import type {
  RegistryCatalog,
  RecipeFieldDraft,
} from "@govtech-bb/form-builder";
import {
  REGISTRY_COMPONENTS,
  REGISTRY_BLOCKS,
  REGISTRY_PRIMITIVES,
} from "@govtech-bb/registry";
import { Tabs } from "../ui/tabs";

interface FieldPickerProps {
  catalog: RegistryCatalog;
  // id is minted by the reducer's ADD_FIELD, not by the picker.
  onAddField: (field: Omit<RecipeFieldDraft, "id">) => void;
}

type Tab = "Components" | "Blocks" | "Custom";
const TABS: Tab[] = ["Custom", "Components", "Blocks"];
const TAB_LABELS = {
  Custom: "Basic fields",
  Components: "Common questions",
  Blocks: "Question groups",
};

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function FieldPicker({ catalog, onAddField }: FieldPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Custom");
  const [query, setQuery] = useState("");

  const components = Object.entries(REGISTRY_COMPONENTS)
    .filter(([ref]) => !(ref in REGISTRY_PRIMITIVES))
    .filter(([ref, primitive]) =>
      matches(query, primitive.label, primitive.fieldId, ref),
    );
  const blocks = Object.entries(REGISTRY_BLOCKS).filter(([ref, block]) =>
    matches(query, block.blockId, ref),
  );

  type CustomRow =
    | { source: "primitive"; label: string; ref: string; badge: string }
    | { source: "custom"; label: string; ref: string; badge: string };

  const customRows: CustomRow[] = [
    ...Object.entries(REGISTRY_PRIMITIVES).map(([ref, primitive]) => ({
      source: "primitive" as const,
      label: primitive.label,
      ref,
      badge: primitive.fieldId,
    })),
    ...catalog.custom.map((item) => ({
      source: "custom" as const,
      label: item.displayName,
      ref: item.ref,
      badge: item.ref,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const custom = customRows.filter((row) => matches(query, row.label, row.ref));

  const counts: Record<Tab, number> = {
    Components: components.length,
    Blocks: blocks.length,
    Custom: custom.length,
  };

  const activeCount = counts[activeTab];
  const otherTabsWithMatches = TABS.filter(
    (t) => t !== activeTab && counts[t] > 0,
  );

  return (
    <div>
      <div className="relative mb-3">
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions and field types…"
          className="w-full pr-10"
          aria-label="Search fields"
        />
        {query && (
          <Button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            shape="square"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            variant="ghost"
            size="sm"
          >
            ×
          </Button>
        )}
      </div>

      <Tabs
        tabs={TABS.map((tab) => ({
          value: tab,
          label: `${TAB_LABELS[tab]} (${counts[tab]})`,
        }))}
        value={activeTab}
        onValueChange={(tab) => setActiveTab(tab as Tab)}
        aria-label="Field source"
        variant="underline"
        className="mb-3.5"
      />

      {query && activeCount === 0 && otherTabsWithMatches.length > 0 && (
        <p style={{ color: "var(--ui-subtle)" }}>
          No matches here — try{" "}
          {otherTabsWithMatches.map((t, i) => (
            <span key={t}>
              {i > 0 && (i === otherTabsWithMatches.length - 1 ? " or " : ", ")}
              <Button
                type="button"
                className="h-auto px-1 underline"
                onClick={() => setActiveTab(t)}
                variant="secondary"
                size="sm"
              >
                {t} ({counts[t]})
              </Button>
            </span>
          ))}
          .
        </p>
      )}

      {activeTab === "Components" && (
        <div>
          {Object.entries(REGISTRY_COMPONENTS).length === 0 && (
            <p style={{ color: "var(--ui-subtle)" }}>
              No registry components available.
            </p>
          )}
          {components.map(([ref, primitive]) => (
            <Button
              variant="ghost"
              className="h-auto min-h-11 w-full justify-between gap-3 rounded-none border-b border-ui-hairline whitespace-normal text-left"
              key={ref}
              onClick={() =>
                onAddField({ kind: "component", ref, overrides: {} })
              }
            >
              <span style={{ flex: 1 }}>{primitive.label}</span>
              <PlusIcon aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}

      {activeTab === "Blocks" && (
        <div>
          {Object.entries(REGISTRY_BLOCKS).length === 0 && (
            <p style={{ color: "var(--ui-subtle)" }}>
              No registry blocks available.
            </p>
          )}
          {blocks.map(([ref, block]) => (
            <Button
              variant="ghost"
              className="h-auto min-h-11 w-full justify-between gap-3 rounded-none border-b border-ui-hairline whitespace-normal text-left"
              key={ref}
              onClick={() =>
                onAddField({
                  kind: "block",
                  ref,
                  overrides: {},
                  childOverrides: {},
                })
              }
            >
              <span style={{ flex: 1 }}>{block.blockId}</span>
              <PlusIcon aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}

      {activeTab === "Custom" && (
        <div>
          {custom.length === 0 && (
            <p style={{ color: "var(--ui-subtle)" }}>No matches.</p>
          )}
          {custom.map((row) => (
            <Button
              variant="ghost"
              className="h-auto min-h-11 w-full justify-between gap-3 rounded-none border-b border-ui-hairline whitespace-normal text-left"
              key={`${row.source}:${row.ref}`}
              onClick={() =>
                onAddField(
                  row.source === "primitive"
                    ? { kind: "component", ref: row.ref, overrides: {} }
                    : { kind: "custom", ref: row.ref, overrides: {} },
                )
              }
            >
              <span style={{ flex: 1 }}>{row.label}</span>
              <PlusIcon aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
