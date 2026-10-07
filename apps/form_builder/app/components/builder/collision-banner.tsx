import { Banner } from "../ui/banner";
import type { findRecipeIdCollisions } from "@govtech-bb/form-builder";

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
    <Banner variant="error" size="sm" role="alert">
      <div className="min-w-0 flex-1">
        <strong>Duplicate IDs must be fixed before saving or deploying</strong>
        <ul className="mt-1 mb-0 pl-4.5 [&_li]:my-0.5 [&_code]:font-mono [&_code]:text-[12px]">
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
    </Banner>
  );
}
