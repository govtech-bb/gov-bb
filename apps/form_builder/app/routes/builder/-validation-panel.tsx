import type { ValidationIssue } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

interface ValidationPanelProps {
  result: { valid: boolean; errors: ValidationIssue[] } | null;
}

export function ValidationPanel({ result }: ValidationPanelProps) {
  if (result === null) return null;

  if (result.valid) {
    return <div className={styles.validationSuccess}>Recipe is valid.</div>;
  }

  return (
    <div className={styles.validationErrors}>
      <strong>Validation errors:</strong>
      <ul>
        {result.errors.map((issue, i) => (
          <li key={i}>
            <code>{issue.path}</code>: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
