/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PresenceBanner } from "./-presence-banner";
import type { PresenceHolder } from "../../server/presence";

function holder(over: Partial<PresenceHolder> = {}): PresenceHolder {
  return {
    userLogin: "alice",
    claimedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastActivityAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...over,
  };
}

describe("PresenceBanner", () => {
  it("names the current editor and announces read-only as an alert", () => {
    render(<PresenceBanner holder={holder({ userLogin: "bob" })} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("bob");
    expect(alert).toHaveTextContent(/read-only/i);
  });

  it("humanises recent activity as 'just now'", () => {
    render(
      <PresenceBanner
        holder={holder({ lastActivityAt: new Date().toISOString() })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/active just now/i);
  });

  it("pluralises minutes for older activity", () => {
    render(
      <PresenceBanner
        holder={holder({
          lastActivityAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/active 3 minutes ago/i);
  });

  it("falls back to 'recently' for an unparseable timestamp", () => {
    render(<PresenceBanner holder={holder({ lastActivityAt: "not-a-date" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/active recently/i);
  });
});
