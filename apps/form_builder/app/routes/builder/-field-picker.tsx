import { useState } from "react";
import type { RegistryCatalog, RecipeFieldDraft } from "@govtech-bb/form-builder";
import {
  REGISTRY_COMPONENTS,
  REGISTRY_BLOCKS,
  REGISTRY_PRIMITIVES,
} from "@govtech-bb/registry";
import styles from "../../styles/builder.module.css";

interface FieldPickerProps {
  catalog: RegistryCatalog;
  // id is minted by the reducer's ADD_FIELD, not by the picker.
  onAddField: (field: Omit<RecipeFieldDraft, "id">) => void;
}

type Tab = "Components" | "Blocks" | "Custom";
const TABS: Tab[] = ["Components", "Blocks", "Custom"];

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function FieldPicker({ catalog, onAddField }: FieldPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Components");
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
  const otherTabsWithMatches = TABS.filter((t) => t !== activeTab && counts[t] > 0);

  return (
    <div>
      <div className={styles.pickerSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fields…"
          className={styles.pickerSearchInput}
          aria-label="Search fields"
        />
        {query && (
          <button
            type="button"
            className={styles.pickerSearchClear}
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab} ({counts[tab]})
          </button>
        ))}
      </div>

      {query && activeCount === 0 && otherTabsWithMatches.length > 0 && (
        <p style={{ color: "#888" }}>
          No matches here — try{" "}
          {otherTabsWithMatches.map((t, i) => (
            <span key={t}>
              {i > 0 && (i === otherTabsWithMatches.length - 1 ? " or " : ", ")}
              <button
                type="button"
                className={styles.pickerHintLink}
                onClick={() => setActiveTab(t)}
              >
                {t} ({counts[t]})
              </button>
            </span>
          ))}
          .
        </p>
      )}

      {activeTab === "Components" && (
        <div>
          {Object.entries(REGISTRY_COMPONENTS).length === 0 && (
            <p style={{ color: "#888" }}>No registry components available.</p>
          )}
          {components.map(([ref, primitive]) => (
            <div
              key={ref}
              className={styles.fieldRow}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onAddField({ kind: "component", ref, overrides: {} })
              }
            >
              <span style={{ flex: 1 }}>{primitive.label}</span>
              <span className={styles.badge}>{primitive.fieldId}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Blocks" && (
        <div>
          {Object.entries(REGISTRY_BLOCKS).length === 0 && (
            <p style={{ color: "#888" }}>No registry blocks available.</p>
          )}
          {blocks.map(([ref, block]) => (
            <div
              key={ref}
              className={styles.fieldRow}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onAddField({ kind: "block", ref, overrides: {}, childOverrides: {} })
              }
            >
              <span style={{ flex: 1 }}>{block.blockId}</span>
              <span className={styles.badge}>{ref}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Custom" && (
        <div>
          {custom.length === 0 && (
            <p style={{ color: "#888" }}>No matches.</p>
          )}
          {custom.map((row) => (
            <div
              key={`${row.source}:${row.ref}`}
              className={styles.fieldRow}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onAddField(
                  row.source === "primitive"
                    ? { kind: "component", ref: row.ref, overrides: {} }
                    : { kind: "custom", ref: row.ref, overrides: {} },
                )
              }
            >
              <span style={{ flex: 1 }}>{row.label}</span>
              <span className={styles.badge}>{row.badge}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
