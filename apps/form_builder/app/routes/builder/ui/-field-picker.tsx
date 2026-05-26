import { useState } from "react";
import type { RegistryCatalog, RecipeFieldDraft } from "@govtech-bb/form-builder";
import { REGISTRY_COMPONENTS, REGISTRY_BLOCKS } from "@govtech-bb/registry";
import styles from "../../../styles/builder.module.css";

interface FieldPickerProps {
  catalog: RegistryCatalog;
  onAddField: (field: RecipeFieldDraft) => void;
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

  const components = Object.entries(REGISTRY_COMPONENTS).filter(([ref, primitive]) =>
    matches(query, primitive.label, primitive.fieldId, ref),
  );
  const blocks = Object.entries(REGISTRY_BLOCKS).filter(([ref, block]) =>
    matches(query, block.blockId, ref),
  );
  const custom = catalog.custom.filter((item) =>
    matches(query, item.displayName, item.ref),
  );

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
          {catalog.custom.length === 0 && (
            <p style={{ color: "#888" }}>No custom components registered.</p>
          )}
          {custom.map((item) => (
            <div
              key={item.ref}
              className={styles.fieldRow}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onAddField({ kind: "custom", ref: item.ref, overrides: {} })
              }
            >
              <span style={{ flex: 1 }}>{item.displayName}</span>
              <span className={styles.badge}>{item.ref}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
