/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LinkForm, LinkPicker, type LinkPage } from "./link-picker";

const pages: LinkPage[] = [
  { title: "Apply for a passport", url: "/travel/apply-for-a-passport" },
  { title: "Passport fees", url: "/travel/passport-fees" },
  { title: "Register a business name", url: "/business/register-a-business-name" },
];

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

const field = () => host.querySelector("input")!;

const options = () => [...host.querySelectorAll<HTMLElement>('[role="option"]')];

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const press = (key: string) =>
  act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });

function Picker({ onPick }: { onPick: (page: LinkPage) => void }) {
  const [value, setValue] = useState("");

  return (
    <LinkPicker
      aria-label="Link"
      value={value}
      onValueChange={setValue}
      pages={pages}
      onPick={onPick}
    />
  );
}

test("finds pages by their titles, the first ready for Enter, and ↓ moves to the next", async () => {
  const picked: string[] = [];
  await render(<Picker onPick={(page) => picked.push(page.url)} />);
  expect(field().getAttribute("role")).toBe("combobox");

  await type("passp");
  expect(options().map((option) => option.textContent)).toEqual([
    "Passport fees/travel/passport-fees",
    "Apply for a passport/travel/apply-for-a-passport",
  ]);
  expect(field().getAttribute("aria-activedescendant")).toBe(options()[0]!.id);

  await press("ArrowDown");
  await press("Enter");
  expect(picked).toEqual(["/travel/apply-for-a-passport"]);
});

test("an address typed in full doesn't search, and a domain leaves Enter to the form", async () => {
  await render(<Picker onPick={() => {}} />);
  await type("/travel");
  expect(options()).toEqual([]);

  await type("passport.gov.bb");
  expect(field().getAttribute("aria-activedescendant")).toBeNull();
});

test("without pages it's a plain field for an address", async () => {
  await render(<LinkPicker aria-label="Link" value="" onValueChange={() => {}} />);
  expect(field().getAttribute("role")).toBeNull();
  expect(field().placeholder).toBe("https://www.gov.bb or /guidance");
});

test("the form checks the address with the link policy, and a page picked applies with its title", async () => {
  const applied: [string, string][] = [];

  await render(
    <LinkForm
      pages={pages}
      toAddress={(typed) => (typed.startsWith("javascript:") ? null : `checked:${typed.trim()}`)}
      onApply={(url, text) => applied.push([url, text])}
    />,
  );

  const submit = () =>
    act(async () => {
      host
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Enter a link destination.");

  await type("javascript:alert(1)");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/^Enter a relative link/);
  expect(field().getAttribute("aria-invalid")).toBe("true");

  await type("www.gov.bb");
  await submit();
  await type("fees");
  await act(async () => options()[0]!.click());
  expect(applied).toEqual([
    ["checked:www.gov.bb", "www.gov.bb"],
    ["checked:/travel/passport-fees", "Passport fees"],
  ]);
});
