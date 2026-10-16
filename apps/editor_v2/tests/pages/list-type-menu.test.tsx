/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import {
  hoverPageMenu,
  pageControl,
  renderPageEditor,
  selectPageText,
} from "../helpers/page-editor";

test.each(
  [
    {
      source: "1. Parent\n   - Nested\n2. Sibling\n",
      from: "ul",
      to: "ol",
      action: "numbered",
      hidden: "bulleted",
    },
    {
      source: "- Parent\n  1. Nested\n- Sibling\n",
      from: "ol",
      to: "ul",
      action: "bulleted",
      hidden: "numbered",
    },
  ].flatMap((fixture) => [true, false].map((hover) => ({ ...fixture, hover }))),
)(
  "conversion with hover=$hover changes only the nested $from list",
  async ({ source, from, to, action, hidden, hover }) => {
    await renderPageEditor(source);
    await selectPageText(hover ? "Parent" : "Nested");

    if (hover) await hoverPageMenu(pageControl<HTMLElement>(`.page-editable > ${to} ${from} > li`));
    else
      await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());
    const menu = pageControl(".page-block-menu");
    expect(menu.textContent).not.toContain(`Change to ${hidden} list`);

    const conversion = [...menu.querySelectorAll("button")].find(
      (button) => button.textContent === `Change to ${action} list`,
    );

    expect(conversion).toBeDefined();
    await act(async () => conversion!.click());
    expect(pageControl(`.page-editable > ${to} ${to}`).textContent).toBe("Nested");
    expect(pageControl(`.page-editable > ${to}`).textContent).toBe("ParentNestedSibling");
  },
);
