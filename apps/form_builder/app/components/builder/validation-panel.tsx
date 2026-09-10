import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import type { RecipeValidateResponse } from "@govtech-bb/form-builder";

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
        <ul className="mt-1 mb-0 pl-4.5 [&_li]:my-0.5 [&_code]:font-mono [&_code]:text-[12px]">
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
