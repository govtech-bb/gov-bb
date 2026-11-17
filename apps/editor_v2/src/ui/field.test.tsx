/** @vitest-environment jsdom */
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Field, FieldGroup, FieldText } from "./field";
import { Input } from "./input";
import { NativeSelect } from "./native-select";
import { Textarea } from "./textarea";

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

// The texts that describe a control, in order
const description = (control: Element) =>
  (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

test("labels its input and describes it with the hint", async () => {
  await render(
    <Field label="Service name" hint="People see this in search results">
      <Input defaultValue="Renew a passport" />
    </Field>,
  );

  const input = host.querySelector("input")!;

  expect([...input.labels!].map((label) => label.textContent)).toEqual(["Service name"]);
  expect(description(input)).toEqual(["People see this in search results"]);
  expect(input.hasAttribute("aria-invalid")).toBe(false);
});

test("an error marks the control invalid and is read out with it", async () => {
  await render(
    <Field label="Service name" hint="People see this in search results" error="Enter a name">
      <Input />
    </Field>,
  );

  const input = host.querySelector("input")!;

  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(description(input)).toEqual(["People see this in search results", "Enter a name"]);
});

test("a textarea takes the field's label, and its own handlers still run", async () => {
  const onChange = vi.fn();

  await render(
    <Field label="Introduction" error="Keep it under 160 characters">
      <Textarea rows={3} defaultValue="" onChange={onChange} />
    </Field>,
  );

  const textarea = host.querySelector("textarea")!;

  expect([...textarea.labels!].map((label) => label.textContent)).toEqual(["Introduction"]);
  expect(textarea.rows).toBe(3);
  expect(textarea.getAttribute("aria-invalid")).toBe("true");
  expect(description(textarea)).toEqual(["Keep it under 160 characters"]);

  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;

    set.call(textarea, "Apply online");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("a disabled field disables its control", async () => {
  await render(
    <Field label="Slug" disabled>
      <Input defaultValue="renew-a-passport" />
    </Field>,
  );

  expect(host.querySelector("input")!.disabled).toBe(true);
});

test("a native select takes the field's label and error, and reports its choice", async () => {
  const onChange = vi.fn();

  await render(
    <Field label="Document type" error="Choose a document type">
      <NativeSelect defaultValue="" onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose</option>
        <option value="supporting">Supporting page</option>
      </NativeSelect>
    </Field>,
  );

  const select = host.querySelector("select")!;

  expect([...select.labels!].map((label) => label.textContent)).toEqual(["Document type"]);
  expect(select.getAttribute("aria-invalid")).toBe("true");
  expect(description(select)).toEqual(["Choose a document type"]);

  await act(async () => {
    select.value = "supporting";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("supporting");
});

test("a textarea's ref reaches the element, beside the field's own", async () => {
  const ref = createRef<HTMLTextAreaElement>();

  await render(
    <Field label="Markdown source">
      <Textarea ref={ref} defaultValue="# Title" />
    </Field>,
  );

  expect(ref.current).toBe(host.querySelector("textarea"));
  expect([...ref.current!.labels!].map((label) => label.textContent)).toEqual(["Markdown source"]);
});

test("a native select shows its icon before the choice, hidden from screen readers", async () => {
  await render(
    <Field label="Visibility">
      <NativeSelect icon={<span data-dot="" />} defaultValue="public">
        <option value="public">Public</option>
      </NativeSelect>
    </Field>,
  );

  const icon = host.querySelector("[data-dot]")!.parentElement!;

  expect(icon.getAttribute("aria-hidden")).toBe("true");
  expect([...host.querySelector("select")!.labels!].map((label) => label.textContent)).toEqual([
    "Visibility",
  ]);
});

test("read-only text shows under its label, with its error", async () => {
  await render(
    <FieldText label="Publication date" error="The server rejected this date">
      12 Oct 2026
    </FieldText>,
  );

  expect([...host.querySelectorAll("span, p")].map((element) => element.textContent)).toEqual([
    "Publication date",
    "12 Oct 2026",
    "The server rejected this date",
  ]);
});

test("a group labels its controls together, and each keeps its own name", async () => {
  await render(
    <FieldGroup label="Filed under">
      <button type="button" aria-label="Remove Business and trade" />
      <NativeSelect aria-label="Add category" defaultValue="">
        <option value="">Add category…</option>
      </NativeSelect>
    </FieldGroup>,
  );

  const group = host.querySelector("fieldset")!;
  const select = host.querySelector("select")!;

  expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Filed under",
  );
  expect(select.getAttribute("aria-label")).toBe("Add category");
  expect(select.hasAttribute("aria-labelledby")).toBe(false);
});

test("its size reaches its control, which can still take its own", async () => {
  await render(
    <>
      <Field size="sm" label="Button destination">
        <Input />
      </Field>
      <Field size="sm" label="Button style">
        <NativeSelect>
          <option>Primary</option>
        </NativeSelect>
      </Field>
      <Field size="sm" label="Search">
        <Input size="md" />
      </Field>
      <Input aria-label="Alone" />
    </>,
  );

  const [destination, search, alone] = host.querySelectorAll("input");

  expect(destination!.classList).toContain("h-8");
  expect(host.querySelector("select")!.classList).toContain("h-8");
  expect(search!.classList).toContain("h-9");
  expect(alone!.classList).toContain("h-9");
});
