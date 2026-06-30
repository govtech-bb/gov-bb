import { Button, Heading, LinkButton, Text } from "@govtech-bb/react";
import type { ReactNode } from "react";

// Mirrors the landing app's ErrorPage (apps/landing/src/components/ErrorPage.tsx)
// so forms error states look identical to the rest of the platform. Promoting
// this into the shared @govtech-bb/react package is the proper long-term home
// (#1692), but that package is external/published, so it is mirrored here for now.
//
// Unlike landing's version, an action may be a link (`href`) OR a button
// (`onClick`) — forms' connection/generic error states keep a "Try again"
// retry that re-runs the route loader, which a plain link cannot do.
type ErrorPageAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

interface ErrorPageProps {
  title: string;
  intro: ReactNode;
  suggestions: ReactNode[];
  secondary?: ErrorPageAction;
  primary?: ErrorPageAction;
}

function ActionButton({
  action,
  variant,
}: {
  action: ErrorPageAction;
  variant: "primary" | "secondary";
}) {
  if ("href" in action) {
    return (
      <LinkButton href={action.href} variant={variant}>
        {action.label}
      </LinkButton>
    );
  }
  return (
    <Button type="button" variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function ErrorPage({
  title,
  intro,
  suggestions,
  secondary,
  primary,
}: ErrorPageProps) {
  return (
    <div className="container py-8 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2 lg:space-y-8">
          <Heading as="h1">{title}</Heading>
          <Text as="p">{intro}</Text>
          <div className="space-y-4">
            <Heading as="h3">Suggestions:</Heading>
            <ul className="list-disc space-y-2 ps-8">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <Text as="span">{s}</Text>
                </li>
              ))}
            </ul>
          </div>
          {(secondary || primary) && (
            <div className="flex flex-wrap gap-4 pt-2">
              {secondary && (
                <ActionButton action={secondary} variant="secondary" />
              )}
              {primary && <ActionButton action={primary} variant="primary" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
