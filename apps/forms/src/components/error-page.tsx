import {
  Button,
  ButtonGroup,
  Heading,
  LinkButton,
  List,
  Text,
} from "@govtech-bb/react";
import type { ReactNode } from "react";

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
    <div className="govbb-width-container govbb-main-wrapper">
      <div className="govbb-grid-row">
        <div className="govbb-grid-column-two-thirds-from-desktop flex flex-col gap-6 lg:gap-8">
          <Heading as="h1">{title}</Heading>
          <Text as="p">{intro}</Text>
          <div className="flex flex-col gap-4">
            <Heading as="h2" size="h3">
              Suggestions:
            </Heading>
            <List variant="bullet">
              {suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </List>
          </div>
          {(secondary || primary) && (
            <ButtonGroup className="pt-2">
              {secondary && (
                <ActionButton action={secondary} variant="secondary" />
              )}
              {primary && <ActionButton action={primary} variant="primary" />}
            </ButtonGroup>
          )}
        </div>
      </div>
    </div>
  );
}
