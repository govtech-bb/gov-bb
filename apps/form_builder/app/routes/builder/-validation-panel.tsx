import type { RecipeValidateResponse } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

interface ValidationPanelProps {
  result: RecipeValidateResponse | null;
  onDismiss: () => void;
}

export function ValidationPanel({ result, onDismiss }: ValidationPanelProps) {
  if (result === null) return null;

  if (result.valid) {
    return (
      <div
        className={styles.successBanner}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Recipe is valid — no issues found.</span>
        <button type="button" onClick={onDismiss} style={{ marginLeft: 8 }}>
          Dismiss
        </button>
      </div>
    );
  }

  // role="status" (polite), not "alert": issues here are advisory — the spec
  // reserves the alert role for hard rejections like the duplicate-ID banner.
  return (
    <div className={styles.errorBanner} role="status">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong>
          {result.issues.length} validation{" "}
          {result.issues.length === 1 ? "issue" : "issues"} found
        </strong>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <ul className={styles.bannerList}>
        {result.issues.map((issue, i) => (
          <li key={i}>
            {issue.path && <code>{issue.path}: </code>}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
