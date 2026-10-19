/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SaveState, type SaveStateProps } from "./save-state";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

const status = (props: SaveStateProps) => render(<SaveState.Status {...props} />);

// What a screen reader has been told, politely
const said = () => host.querySelector('[aria-live="polite"]')?.textContent;

const shown = () => host.firstElementChild?.textContent;

test("each state says who can see the work", async () => {
  const words = new Map([
    ["unsaved", "Unsaved changes"],
    ["saved", "Saved"],
    ["unpublished", "Unpublished changes"],
    ["published", "Published"],
    ["saving", "Saving…"],
    ["failed", "Not saved"],
    ["paused", "Editing paused"],
  ] as const);

  for (const [state, text] of words) {
    await status({ status: state });
    expect(shown()).toBe(text);
  }
});

test("ordinary typing and unapplied source stay silent", async () => {
  await status({ status: "saved" });
  await status({ status: "unsaved" });
  await status({ status: "paused" });
  await status({ status: "unsaved" });
  expect(said()).toBe("");
});

test("a failure is read out with its reason, and so is a successful server retry", async () => {
  await status({ status: "unsaved" });
  await status({ status: "failed", error: "The API could not be reached." });
  expect(said()).toBe("The API could not be reached.");
  await status({ status: "saving" });
  await status({ status: "saved" });
  expect(said()).toBe("Changes saved");
});

test("a save the author asked for is read out each time it goes through", async () => {
  await status({ status: "unpublished" });
  await status({ status: "saving" });
  await status({ status: "published" });
  expect(said()).toBe("Changes published");

  // Typing again empties it, so the next publish is read out as well
  await status({ status: "unpublished" });
  expect(said()).toBe("");
  await status({ status: "saving" });
  await status({ status: "published" });
  expect(said()).toBe("Changes published");
});

test("a conflict is read out as it arrives, including one there from the start", async () => {
  const newer = "A newer version of this page has been saved since you opened it.";

  await status({ status: "unpublished", conflict: newer });
  expect(said()).toBe(newer);

  await render(null);
  await status({ status: "published" });
  await status({ status: "unpublished" });
  expect(said()).toBe("");
  await status({ status: "unpublished", conflict: newer });
  expect(said()).toBe(newer);
});

test("a failed save shows why, with Try again and Download a copy", async () => {
  const retry = vi.fn();
  const download = vi.fn();

  const failure = (props: SaveStateProps) =>
    render(<SaveState.Failure onRetry={retry} onDownload={download} {...props} />);

  await failure({ status: "saved" });
  expect(host.childElementCount).toBe(0);

  await failure({ status: "failed", error: "We could not save this page." });

  const strip = host.firstElementChild!;
  const buttons = [...strip.querySelectorAll("button")];

  expect(strip.textContent).toContain("We could not save this page.");
  // The status beside the title reads it out, so it isn't an alert as well
  expect(strip.getAttribute("role")).toBe("none");
  expect(buttons.map((button) => button.textContent)).toEqual(["Try again", "Download a copy"]);
  await act(async () => buttons[0]!.click());
  await act(async () => buttons[1]!.click());
  expect(retry).toHaveBeenCalledOnce();
  expect(download).toHaveBeenCalledOnce();
});
