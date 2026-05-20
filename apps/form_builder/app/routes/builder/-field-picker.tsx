import { useState } from "react";
import type { RegistryCatalog, RecipeFieldDraft } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

interface FieldPickerProps {
  catalog: RegistryCatalog;
  onAddField: (field: RecipeFieldDraft) => void;
}

type Tab = "Components" | "Blocks" | "Custom";
const TABS: Tab[] = ["Components", "Blocks", "Custom"];

export function FieldPicker({ catalog, onAddField }: FieldPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Components");

  return (
    <div>
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Components" && (
        <div>
          {catalog.components.map((item) => (
            <div
              key={item.ref}
              className={styles.fieldRow}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onAddField({ kind: "component", ref: item.ref, overrides: {} })
              }
            >
              <span style={{ flex: 1 }}>{item.displayName}</span>
              <span className={styles.badge}>{item.ref}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Blocks" && (
        <div>
          {catalog.blocks.map((item) => (
            <div
              key={item.ref}
              className={styles.fieldRow}
              style={{ cursor: "pointer" }}
              onClick={() =>
                onAddField({ kind: "block", ref: item.ref, overrides: {}, childOverrides: {} })
              }
            >
              <span style={{ flex: 1 }}>{item.displayName}</span>
              <span className={styles.badge}>{item.ref}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Custom" && (
        <div>
          {catalog.custom.length === 0 && (
            <p style={{ color: "#888" }}>No custom components registered.</p>
          )}
          {catalog.custom.map((item) => (
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
