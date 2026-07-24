import React from "react";
import { render, screen } from "@testing-library/react";
import { markdownComponents } from "./markdown-components";

// react-markdown emits bare HTML elements, which Tailwind's preflight reset
// strips of heading sizes / list markers. These tests pin the gov design-system
// typography classes onto each mapped element so confirmation-page markdown
// renders with the same styling as hand-authored gov markup.
const renderTag = (tag: keyof typeof markdownComponents, children: string) => {
  const Tag = markdownComponents[tag] as React.ElementType;
  render(<Tag>{children}</Tag>);
};

describe("markdownComponents", () => {
  it("renders an h1 with the gov h1 typography class", () => {
    renderTag("h1", "Title");
    expect(
      screen.getByRole("heading", { name: "Title", level: 1 }),
    ).toHaveClass("govbb-text-h1");
  });

  it("renders an h2 with the gov h2 typography class", () => {
    renderTag("h2", "What you need to know");
    expect(
      screen.getByRole("heading", { name: "What you need to know", level: 2 }),
    ).toHaveClass("govbb-text-h2");
  });

  it("renders an h3 with the gov h3 typography class", () => {
    renderTag("h3", "Subheading");
    expect(
      screen.getByRole("heading", { name: "Subheading", level: 3 }),
    ).toHaveClass("govbb-text-h3");
  });

  it("renders an unordered list with the gov bullet-list classes", () => {
    const Ul = markdownComponents.ul as React.ElementType;
    render(
      <Ul>
        <li>Item</li>
      </Ul>,
    );
    expect(screen.getByRole("list")).toHaveClass(
      "govbb-list",
      "govbb-list--bullet",
    );
  });

  it("renders an anchor with the gov link class", () => {
    const A = markdownComponents.a as React.ElementType;
    render(<A href="https://gov.bb">Link</A>);
    expect(screen.getByRole("link", { name: "Link" })).toHaveClass(
      "govbb-link",
    );
  });
});
