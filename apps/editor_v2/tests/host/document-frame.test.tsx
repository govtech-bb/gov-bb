/** @vitest-environment jsdom */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createTextNode, $getRoot, $isElementNode, type LexicalEditor } from "lexical";
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { FormComposer, FormTitle } from "../../src/host/form-composer";
import { PageDraftEditor } from "../../src/host/page-editor";
import { DraftStore } from "../../src/persistence";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { govbbFormEditor, govbbFormCodec } from "../../src/presets/govbb-form";
import { renderInPage } from "../helpers/page-editor";

beforeEach(() => {
  // The settings panel sits beside the page, as on a wide screen
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

const heading = () => document.querySelector("h1")?.textContent;

const type = (input: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

test("a page's bar is headed by its title, as the title is typed", async () => {
  const store = new DraftStore(
    "---\ntitle: Renew a passport\n---\n\nBring your old passport.\n",
    govbbPageCodec,
  );

  await renderInPage(<PageDraftEditor store={store} />);

  const bar = document.querySelector('[role="toolbar"][aria-label="Page tools"]')!;

  expect(bar.querySelector("h1")?.textContent).toBe("Renew a passport");
  expect(document.querySelectorAll("h1")).toHaveLength(1);

  const title = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Page title"]')!;

  await type(title, "Renew a Barbados passport");
  expect(heading()).toBe("Renew a Barbados passport");
  await type(title, "");
  expect(heading()).toBe("Untitled page");
});

test("a form's bar is headed by the form's name, as it's typed", async () => {
  let editor: LexicalEditor | undefined;

  function Capture() {
    [editor] = useLexicalComposerContext();

    return null;
  }

  // Explicitly initialize a new, unnamed form.
  await renderInPage(
    <FormComposer
      definition={govbbFormEditor}
      store={
        new DraftStore(
          '---\nformat: govbb-form\nformatVersion: 2\ntitle: ""\n---\n\n# Page\n\n::page{#page}\n',
          govbbFormCodec,
        )
      }
    >
      <Capture />
      <h1>
        <FormTitle />
      </h1>
    </FormComposer>,
  );

  expect(heading()).toBe("Untitled form");

  const rename = (text: string) =>
    act(async () => {
      editor!.update(
        () => {
          const name = $getRoot().getFirstChild();

          if (!$isElementNode(name)) throw new Error("The form has no name");
          name.clear();

          if (text) name.append($createTextNode(text));
        },
        { discrete: true },
      );
    });

  await rename("Apply for a noise permit");
  expect(heading()).toBe("Apply for a noise permit");
  await rename("");
  expect(heading()).toBe("Untitled form");
});
