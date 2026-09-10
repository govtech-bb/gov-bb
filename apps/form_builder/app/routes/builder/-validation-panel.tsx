import { Banner } from "../../component/ui/banner";
import { Button } from "../../component/ui/button";
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
      <Banner
        variant="success"
        size="sm"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="min-w-0 flex-1">
          <span>Recipe is valid — no issues found.</span>
          <Button
            type="button"
            onClick={onDismiss}
            style={{ marginLeft: 8 }}
            variant="secondary"
            size="sm"
          >
            Dismiss
          </Button>
        </div>
      </Banner>
    );
  }

  // role="status" (polite), not "alert": issues here are advisory — the spec
  // reserves the alert role for hard rejections like the duplicate-ID banner.
  return (
    <Banner variant="error" size="sm" role="status">
      <div className="min-w-0 flex-1">
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
          <Button
            type="button"
            onClick={onDismiss}
            variant="secondary"
            size="sm"
          >
            Dismiss
          </Button>
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
    </Banner>
  );
}
