import type { findRecipeIdCollisions } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

/** Collapse repeated identical locations ("Declaration › Name; Declaration ›
 *  Name; …") into one entry with a count ("Declaration › Name ×4"). */
function formatCollisionLocations(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts]
    .map(([text, n]) => (n > 1 ? `${text} ×${n}` : text))
    .join(", ");
}

interface CollisionBannerProps {
  idCollisions: ReturnType<typeof findRecipeIdCollisions>;
}

export function CollisionBanner({ idCollisions }: CollisionBannerProps) {
  if (
    idCollisions.fieldIdCollisions.length === 0 &&
    idCollisions.stepIdCollisions.length === 0
  ) {
    return null;
  }

  return (
    <div className={styles.errorBanner} role="alert">
      <strong>Duplicate IDs must be fixed before saving or deploying</strong>
      <ul className={styles.bannerList}>
        {idCollisions.fieldIdCollisions.map((c) => (
          <li key={`field-${c.id}`}>
            Field ID <code>{c.id}</code> is used by {c.locations.length}{" "}
            fields:{" "}
            {formatCollisionLocations(
              c.locations.map(
                (l) => `${l.stepTitle || l.stepId} › ${l.display}`,
              ),
            )}
          </li>
        ))}
        {idCollisions.stepIdCollisions.map((c) => (
          <li key={`step-${c.stepId}`}>
            Step ID <code>{c.stepId}</code> is used by {c.locations.length}{" "}
            steps:{" "}
            {formatCollisionLocations(
              c.locations.map((l) => l.stepTitle || l.stepId),
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
