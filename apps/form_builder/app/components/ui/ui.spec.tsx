/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Catalogue,
  OverlayExamples,
  SelectionExamples,
  NavigationExamples,
  FormPattern,
  ElevationExamples,
} from "../../routes/-ui-catalogue";
import { useTheme } from "../../routes/content/-use-theme";
import {
  Input,
  InputArea,
  Select,
  SensitiveInput,
  Switch,
  ToastProvider,
  createToastManager,
  Button,
  LinkButton,
  Field,
  Tabs,
  DateRangePicker,
  Sidebar,
  Radio,
  TableOfContents,
  Dialog,
  Tooltip,
  Combobox,
  DropdownMenu,
  Elevated,
  SurfaceProvider,
  surfaceClasses,
  ScrollArea,
} from ".";
import { Form } from "@base-ui/react/form";
Object.defineProperty(Element.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: () => {},
});
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("clamps surface levels and keeps refs, styling, and nested context", () => {
  const ref = createRef<HTMLDivElement>();
  render(
    <SurfaceProvider value={1}>
      <Elevated
        offset={2}
        shadowLevel={3}
        ref={ref}
        data-testid="surface"
        className="rounded-xl"
        style={{ padding: 12 }}
      >
        <Elevated offset={4} data-testid="nested-surface">
          <Elevated offset={20} data-testid="highest-surface" />
        </Elevated>
      </Elevated>
    </SurfaceProvider>,
  );
  expect(ref.current).toBe(screen.getByTestId("surface"));
  expect(ref.current).toHaveAttribute("data-ui-surface", "3");
  expect(ref.current).toHaveClass("rounded-xl", "shadow-ui-surface-3");
  expect(ref.current).toHaveStyle({ padding: "12px" });
  expect(screen.getByTestId("nested-surface")).toHaveAttribute(
    "data-ui-surface",
    "7",
  );
  expect(screen.getByTestId("highest-surface")).toHaveAttribute(
    "data-ui-surface",
    "8",
  );
  expect(surfaceClasses(-2, 40)).toBe("bg-ui-surface-1 shadow-ui-surface-8");
  expect(surfaceClasses(2.5, NaN)).toBe("bg-ui-surface-3 shadow-ui-surface-1");
});

it("carries surface depth through dialog, popover, and select portals", async () => {
  const user = userEvent.setup();
  render(<ElevationExamples />);
  await user.click(screen.getByRole("button", { name: "Open surface dialog" }));
  const dialog = await screen.findByRole("dialog", { name: "Nested surfaces" });
  expect(dialog).toHaveAttribute("data-ui-surface", "5");
  expect(dialog).toHaveClass("shadow-ui-surface-5");
  await user.click(screen.getByRole("button", { name: "Open surface menu" }));
  const popover = (await screen.findByText("Menu at level 7")).closest(
    "[data-ui-surface]",
  );
  expect(popover).toHaveAttribute("data-ui-surface", "7");
  expect(popover).toHaveClass("shadow-ui-surface-3");
  await user.click(screen.getByRole("combobox", { name: "Surface role" }));
  const popup = (
    await screen.findByRole("option", { name: "Reviewer" })
  ).closest("[data-ui-surface]");
  expect(popup).toHaveAttribute("data-ui-surface", "8");
  expect(popup).toHaveClass("shadow-ui-surface-3");
  await user.click(screen.getByRole("option", { name: "Reviewer" }));
  expect(
    screen.getByRole("combobox", { name: "Surface role" }),
  ).toHaveTextContent("Reviewer");
});

it("preserves scroll content and refs when orientation or direction changes", async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLDivElement>();
  const content = <input aria-label="Scroll content" defaultValue="Draft" />;
  const { rerender } = render(
    <ScrollArea ref={ref} aria-label="Editor panel">
      {content}
    </ScrollArea>,
  );
  const viewport = screen.getByRole("region", { name: "Editor panel" });
  const input = screen.getByRole("textbox", { name: "Scroll content" });
  await user.type(input, " saved");
  rerender(
    <ScrollArea
      ref={ref}
      aria-label="Editor panel"
      orientation="both"
      dir="rtl"
    >
      {content}
    </ScrollArea>,
  );
  expect(screen.getByRole("region", { name: "Editor panel" })).toBe(viewport);
  expect(screen.getByRole("textbox", { name: "Scroll content" })).toBe(input);
  expect(input).toHaveValue("Draft saved");
  expect(ref.current).toHaveAttribute("dir", "rtl");
  expect(ref.current).toHaveAttribute("data-orientation", "both");
});

it("renders the catalogue with the imported component APIs", async () => {
  const { container } = render(<Catalogue />);
  expect(
    screen.getByRole("heading", { level: 2, name: "Buttons" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Form title" })).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "Required field" }),
  ).toBeChecked();
  expect(screen.getByRole("meter", { name: "Storage used" })).toHaveAttribute(
    "aria-valuenow",
    "64",
  );
  for (const table of screen.getAllByRole("table")) expect(table).toBeVisible();
  await waitFor(() =>
    expect(container.querySelector(".ui-shiki")).toBeInTheDocument(),
  );
});
it("submits a labelled field through Base UI Form", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(
    <Form onFormSubmit={submit}>
      <Field label="Title">
        <Input name="title" aria-label="Title" required />
      </Field>
      <Button type="submit">Save</Button>
    </Form>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Title" }),
    "Transport application",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenCalledWith(
    { title: "Transport application" },
    expect.any(Object),
  );
});
it.each(["default", "card"] as const)(
  "selects %s radios through their labels and keyboard, skipping disabled choices",
  async (appearance) => {
    const user = userEvent.setup();
    render(
      <form aria-label="Audience">
        <Radio.Group
          legend="Who can apply?"
          name="audience"
          defaultValue="residents"
          appearance={appearance}
        >
          <Radio.Item label="Residents" value="residents" />
          <Radio.Item label="Archived" value="archived" disabled />
          <Radio.Item label="Everyone" value="everyone" />
        </Radio.Group>
      </form>,
    );
    const residents = screen.getByRole("radio", { name: "Residents" });
    const everyone = screen.getByRole("radio", { name: "Everyone" });
    const archived = screen.getByRole("radio", { name: "Archived" });
    await user.click(everyone.closest("label")!);
    expect(everyone).toBeChecked();
    await user.keyboard("{ArrowUp}");
    expect(residents).toHaveFocus();
    expect(residents).toBeChecked();
    expect(everyone).not.toBeChecked();
    await user.click(archived.closest("label")!);
    expect(archived).not.toBeChecked();
    expect(residents).toBeChecked();
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).get("audience"),
    ).toBe("residents");
  },
);
it("selects a department and keeps the shared combobox in sync", async () => {
  const user = userEvent.setup();
  render(<SelectionExamples />);
  await user.click(screen.getByRole("combobox", { name: "Department" }));
  await user.click(await screen.findByRole("option", { name: "Transport" }));
  expect(
    screen.getByRole("combobox", { name: "Department" }),
  ).toHaveTextContent("Transport");
  expect(
    screen.getByRole("combobox", { name: "Find a department" }),
  ).toHaveValue("Transport");
});
it("restores focus after dismissing the dialog and runs menu actions", async () => {
  const user = userEvent.setup();
  const { container } = render(<OverlayExamples />);
  const trigger = screen.getByRole("button", { name: "Review form" });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", {
    name: "Review your form",
  });
  expect(dialog).toHaveAccessibleDescription(
    "Check the details before sharing this form.",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel review" }),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "Form actions" }));
  expect(
    await screen.findByRole("menuitem", { name: "Restore archived version" }),
  ).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("menuitem", { name: "Duplicate form" }));
  expect(within(container).getByRole("status")).toHaveTextContent(
    "Form duplicated.",
  );
});
it("filters the command palette and runs a selected command", async () => {
  const user = userEvent.setup();
  const { container } = render(<OverlayExamples />);
  await user.click(screen.getByRole("button", { name: "Search commands" }));
  await user.type(
    await screen.findByRole("combobox", { name: "Search commands" }),
    "Find",
  );
  await user.keyboard("{Enter}");
  expect(within(container).getByRole("status")).toHaveTextContent(
    "Find a submission selected.",
  );
});
it("keeps the UI and app themes synchronized for portals", () => {
  const { result } = renderHook(useTheme);
  expect(document.documentElement).toHaveAttribute("data-mode", "light");
  act(() => result.current.toggleTheme());
  expect(document.documentElement).toHaveAttribute("data-mode", "dark");
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});
it("observes overflowing tabs that become available after an empty render", () => {
  const { rerender } = render(<Tabs tabs={[]} />);
  rerender(<Tabs tabs={[{ value: "fields", label: "Fields" }]} />);
  expect(screen.getByRole("tab", { name: "Fields" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const list = screen.getByRole("tablist");
  Object.defineProperties(list, {
    scrollWidth: { value: 600 },
    clientWidth: { value: 200 },
  });
  fireEvent.scroll(list);
  expect(
    screen.getByRole("button", { name: "Scroll tabs right" }),
  ).toHaveAttribute("aria-hidden", "false");
  rerender(<Tabs tabs={[]} />);
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});
it("keeps adjacent months correct at month-end and across leap years", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2024, 0, 31, 12));
  const user = userEvent.setup();
  render(
    <DateRangePicker onStartDateChange={() => {}} onEndDateChange={() => {}} />,
  );
  const months = () =>
    screen.getAllByRole("textbox", { name: "Edit month and year" });
  expect(months()[0]).toHaveValue("January 2024");
  expect(months()[1]).toHaveValue("February 2024");
  await user.click(screen.getByRole("button", { name: "Next month" }));
  expect(months()[0]).toHaveValue("February 2024");
  expect(months()[1]).toHaveValue("March 2024");
  expect(
    screen.getAllByRole("button", { name: "Thursday, February 29, 2024" }),
  ).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Previous month" }));
  expect(months()[0]).toHaveValue("January 2024");
});
it("starts a new date range after a completed selection and safely resets", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 9, 12));
  const user = userEvent.setup();
  const start = vi.fn();
  const end = vi.fn();
  render(<DateRangePicker onStartDateChange={start} onEndDateChange={end} />);
  await user.click(
    screen.getByRole("button", { name: "Monday, September 14, 2026" }),
  );
  await user.hover(
    screen.getByRole("button", { name: "Wednesday, September 16, 2026" }),
  );
  expect(
    screen.getByRole("button", {
      name: "Wednesday, September 16, 2026, within selected range",
    }),
  ).toBeVisible();
  await user.hover(
    screen.getByRole("button", { name: "Thursday, September 10, 2026" }),
  );
  expect(
    screen.getByRole("button", {
      name: "Wednesday, September 16, 2026",
    }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Friday, September 18, 2026" }),
  );
  expect(start).toHaveBeenLastCalledWith(new Date(2026, 8, 14));
  expect(end).toHaveBeenLastCalledWith(new Date(2026, 8, 18));
  await user.click(
    screen.getByRole("button", { name: "Tuesday, September 22, 2026" }),
  );
  expect(start).toHaveBeenLastCalledWith(new Date(2026, 8, 22));
  expect(end).toHaveBeenLastCalledWith(null);
  await user.click(
    screen.getByRole("button", { name: "Thursday, September 24, 2026" }),
  );
  expect(end).toHaveBeenLastCalledWith(new Date(2026, 8, 24));
  await user.click(screen.getByRole("button", { name: "Reset Dates" }));
  expect(start).toHaveBeenLastCalledWith(null);
  expect(end).toHaveBeenLastCalledWith(null);
  const month = screen.getAllByRole("textbox", {
    name: "Edit month and year",
  })[0];
  await user.clear(month);
  await user.type(month, "not a month{Enter}");
  expect(month).toHaveValue("September 2026");
  expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
});
it("changes tabs with the keyboard and toggles sidebar navigation", async () => {
  const user = userEvent.setup();
  const { container } = render(<NavigationExamples />);
  const tabs = within(screen.getAllByRole("tablist")[0]);
  await user.click(tabs.getByRole("tab", { name: "Fields" }));
  await user.keyboard("{ArrowRight}{Enter}");
  expect(tabs.getByRole("tab", { name: "Responses" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const sidebar = within(screen.getByRole("complementary"));
  await user.click(sidebar.getByRole("button", { name: "Forms" }));
  expect(sidebar.getByRole("button", { name: "Forms" })).toHaveAttribute(
    "data-active",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(container.querySelector("[data-sidebar-wrapper]")).toHaveAttribute(
    "data-state",
    "collapsed",
  );
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(container.querySelector("[data-sidebar-wrapper]")).toHaveAttribute(
    "data-state",
    "expanded",
  );
});
it("reports the mobile sidebar state and restores focus after Escape", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const user = userEvent.setup();
  render(
    <Sidebar.Provider contained defaultOpen>
      <Sidebar>
        <Sidebar.Content>
          <Sidebar.Menu>
            <Sidebar.MenuButton>Forms</Sidebar.MenuButton>
          </Sidebar.Menu>
        </Sidebar.Content>
      </Sidebar>
      <Sidebar.Trigger />
    </Sidebar.Provider>,
  );
  const trigger = screen.getByRole("button", { name: "Expand sidebar" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Forms" })).toHaveFocus(),
  );
  await user.keyboard("{Escape}");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
});
it("keeps loading button names, refs, and disabled link behavior", async () => {
  const user = userEvent.setup();
  const click = vi.fn();
  const ref = createRef<HTMLButtonElement>();
  const { rerender } = render(
    <Button ref={ref} onClick={click}>
      Save changes
    </Button>,
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(click).toHaveBeenCalledTimes(1);
  rerender(
    <Button ref={ref} onClick={click} loading>
      Save changes
    </Button>,
  );
  const saving = screen.getByRole("button", { name: "Save changes" });
  expect(ref.current).toBe(saving);
  expect(saving).toBeDisabled();
  expect(saving).toHaveAttribute("aria-busy", "true");
  await user.click(saving);
  expect(click).toHaveBeenCalledTimes(1);
  rerender(
    <LinkButton href="/settings" disabled onClick={click}>
      Settings
    </LinkButton>,
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  const disabledLink = screen.getByRole("button", { name: "Settings" });
  expect(disabledLink).toBeDisabled();
  await user.click(disabledLink);
  expect(click).toHaveBeenCalledTimes(1);
});
it("preserves nested table-of-contents links and moves the active section", async () => {
  const user = userEvent.setup();
  const click = vi.fn((event) => event.preventDefault());
  const ref = createRef<HTMLAnchorElement>();
  const contents = (active: boolean) => (
    <TableOfContents>
      <TableOfContents.List>
        <TableOfContents.Item href="#intro" active={!active}>
          Introduction
        </TableOfContents.Item>
        <TableOfContents.Group label="Fields" href="#fields">
          <TableOfContents.Item
            ref={ref}
            render={<a />}
            href="#choices"
            active={active}
            onClick={click}
          >
            Choices
          </TableOfContents.Item>
        </TableOfContents.Group>
      </TableOfContents.List>
    </TableOfContents>
  );
  const { rerender } = render(contents(false));
  const choices = screen.getByRole("link", { name: "Choices" });
  expect(ref.current).toBe(choices);
  await user.click(choices);
  expect(click).toHaveBeenCalledTimes(1);
  expect(choices).toHaveAttribute("href", "#choices");
  rerender(contents(true));
  expect(choices).toHaveAttribute("aria-current", "true");
  expect(
    screen.getByRole("link", { name: "Introduction" }),
  ).not.toHaveAttribute("aria-current");
});
it("provides a close button for dialogs and requires explicit alert dismissal", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<OverlayExamples />);
  const trigger = screen.getByRole("button", { name: "Review form" });
  await user.click(trigger);
  await user.click(await screen.findByRole("button", { name: "Close dialog" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  rerender(
    <Dialog.Root role="alertdialog" defaultOpen>
      <Dialog>
        <Dialog.Title>Delete form?</Dialog.Title>
        <Dialog.Description>This removes the form.</Dialog.Description>
        <Dialog.Close render={<Button />}>Keep form</Dialog.Close>
      </Dialog>
    </Dialog.Root>,
  );
  const alert = await screen.findByRole("alertdialog", {
    name: "Delete form?",
  });
  expect(
    within(alert).queryByRole("button", { name: "Close dialog" }),
  ).not.toBeInTheDocument();
  await user.click(document.body);
  expect(alert).toBeVisible();
  await user.click(within(alert).getByRole("button", { name: "Keep form" }));
  await waitFor(() => expect(alert).not.toBeInTheDocument());
});
it("shows tooltips on keyboard focus and dismisses them without moving focus", async () => {
  const user = userEvent.setup();
  render(
    <Tooltip content="This field is optional" render={<Button />}>
      Field help
    </Tooltip>,
  );
  await user.tab();
  const trigger = screen.getByRole("button", { name: "Field help" });
  expect(trigger).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "This field is optional",
  );
  expect(trigger).toHaveAccessibleDescription("This field is optional");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
});
it("keeps filtered multi-select values, disabled options, and custom list rendering", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(
    <Combobox
      multiple
      items={["Education", "Health", "Transport"]}
      defaultValue={["Education"]}
      onValueChange={change}
    >
      <Combobox.TriggerInput aria-label="Departments" />
      <Combobox.Content>
        <Combobox.List
          render={(props, state) => (
            <div {...props} data-empty-list={state.empty} />
          )}
        >
          {(item: string) => (
            <Combobox.Item key={item} value={item} disabled={item === "Health"}>
              {item}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox>,
  );
  const input = screen.getByRole("combobox", { name: "Departments" });
  await user.click(input);
  expect(await screen.findByRole("option", { name: "Health" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("listbox")).toHaveAttribute(
    "data-empty-list",
    "false",
  );
  await user.type(input, "Transport");
  await user.click(await screen.findByRole("option", { name: "Transport" }));
  expect(change).toHaveBeenLastCalledWith(
    ["Education", "Transport"],
    expect.any(Object),
  );
  // Filtered selections close the popup and clear its query after unmount.
  await waitFor(() => {
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });
  await user.type(input, "Education");
  await user.click(await screen.findByRole("option", { name: "Education" }));
  expect(change).toHaveBeenLastCalledWith(["Transport"], expect.any(Object));
  await waitFor(() => {
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });
  await user.click(input);
  await screen.findByRole("listbox");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
  );
  expect(input).toHaveFocus();
});
it("keeps menu checkboxes and submenus interactive with the shared highlight", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  render(
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button />}>
        View options
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.CheckboxItem closeOnClick={false}>
          Show drafts
        </DropdownMenu.CheckboxItem>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>Sort by</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.Item onClick={select}>Newest first</DropdownMenu.Item>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu>,
  );
  const trigger = screen.getByRole("button", { name: "View options" });
  await user.click(trigger);
  const drafts = await screen.findByRole("menuitemcheckbox", {
    name: "Show drafts",
  });
  await user.click(drafts);
  expect(drafts).toHaveAttribute("aria-checked", "true");
  await user.keyboard("{ArrowDown}{ArrowRight}");
  const newest = await screen.findByRole("menuitem", { name: "Newest first" });
  await waitFor(() => expect(newest).toHaveFocus());
  await user.keyboard("{Enter}");
  expect(select).toHaveBeenCalledOnce();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("connects help and errors to text and selection controls, including rich labels", () => {
  render(
    <>
      <Input
        label="Service name"
        description="Public name"
        error="Enter a name."
      />
      <InputArea
        label="Service description"
        description="Public summary"
        error="Enter a summary."
      />
      <Select
        label={<strong>Owner</strong>}
        description="Responsible team"
        error="Choose an owner."
        items={[{ value: "education", label: "Education", disabled: true }]}
      />
      <Combobox
        aria-label="Lookup"
        description="Search teams"
        error="Choose a team."
        items={["Education"]}
      >
        <Combobox.TriggerInput aria-label="Lookup" />
        <Combobox.Content>
          <Combobox.List>
            {(item) => <Combobox.Item value={item}>{item}</Combobox.Item>}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
    </>,
  );
  for (const [name, help, error] of [
    ["Service name", "Public name", "Enter a name."],
    ["Service description", "Public summary", "Enter a summary."],
    ["Owner", "Responsible team", "Choose an owner."],
    ["Lookup", "Search teams", "Choose a team."],
  ]) {
    const control = screen.getByLabelText(name);
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(`${help} ${error}`);
  }
});

it("validates and submits the GovTech service-settings composition", async () => {
  const user = userEvent.setup();
  render(<FormPattern />);
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  expect(
    screen.getByRole("textbox", { name: "Service title" }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("Enter a service title.")).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Service title" }),
    "School transport",
  );
  await user.click(
    screen.getByRole("combobox", { name: "Responsible department" }),
  );
  await user.click(screen.getByRole("option", { name: "Education" }));
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Settings saved in this example.",
  );
  await user.click(screen.getByRole("button", { name: "Reset example" }));
  expect(screen.getByRole("textbox", { name: "Service title" })).toHaveValue(
    "",
  );
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("keeps textarea validation, changes, and forwarded refs connected to its field", async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLTextAreaElement>();
  const submit = vi.fn();
  const change = vi.fn();
  render(
    <Form onFormSubmit={submit}>
      <InputArea
        ref={ref}
        name="summary"
        label="Summary"
        required
        onValueChange={change}
        error={{ match: "valueMissing", message: "Enter a summary." }}
      />
      <Button type="submit">Save summary</Button>
    </Form>,
  );
  const textarea = screen.getByRole("textbox", { name: "Summary" });
  expect(ref.current).toBe(textarea);
  await user.click(screen.getByRole("button", { name: "Save summary" }));
  expect(textarea).toHaveAttribute("aria-invalid", "true");
  expect(submit).not.toHaveBeenCalled();
  await user.type(textarea, "Apply for school transport.");
  expect(change).toHaveBeenLastCalledWith("Apply for school transport.");
  await user.click(screen.getByRole("button", { name: "Save summary" }));
  expect(textarea).not.toHaveAttribute("aria-invalid", "true");
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0]).toEqual({
    summary: "Apply for school transport.",
  });
});

it("keeps sensitive values editable and switches submittable through native controls", async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLInputElement>();
  render(
    <form aria-label="Credentials">
      <SensitiveInput
        ref={ref}
        name="accessKey"
        label="Service access key"
        defaultValue="demo-key"
      />
      <Switch
        name="enabled"
        value="yes"
        label="Enable service"
        defaultChecked
      />
      <Switch.Group legend="Delivery" disabled>
        <Switch.Item label="Send receipts" name="receipts" defaultChecked />
      </Switch.Group>
    </form>,
  );
  const input = screen.getByLabelText("Service access key");
  expect(input).toHaveAttribute("type", "password");
  await user.type(input, "-updated");
  await user.click(screen.getByRole("button", { name: "Reveal value" }));
  expect(input).toHaveAttribute("type", "text");
  expect(ref.current).toBe(input);
  await user.click(screen.getByRole("button", { name: "Copy value" }));
  expect(await navigator.clipboard.readText()).toBe("demo-key-updated");
  await user.click(screen.getByRole("button", { name: "Hide value" }));
  const form = screen.getByRole("form", {
    name: "Credentials",
  }) as HTMLFormElement;
  expect(Object.fromEntries(new FormData(form))).toEqual({
    accessKey: "demo-key-updated",
    enabled: "yes",
  });
  await user.click(screen.getByRole("switch", { name: "Enable service" }));
  expect(new FormData(form).has("enabled")).toBe(false);
  expect(screen.getByRole("switch", { name: "Send receipts" })).toBeDisabled();
});

it("renders Base UI toast updates and actions without a manager adapter", async () => {
  const user = userEvent.setup();
  const manager = createToastManager();
  const action = vi.fn();
  render(
    <ToastProvider toastManager={manager}>
      <span>Workspace</span>
    </ToastProvider>,
  );
  act(() => {
    manager.add({
      id: "save",
      title: "Draft saved",
      type: "success",
      timeout: 0,
    });
  });
  expect(await screen.findByText("Draft saved")).toBeVisible();
  act(() => {
    manager.add({
      id: "save",
      title: "Form published",
      type: "success",
      timeout: 0,
      actionProps: { children: "View form", onClick: action },
    });
  });
  expect(await screen.findByText("Form published")).toBeVisible();
  expect(screen.queryByText("Draft saved")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View form" }));
  expect(action).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: /close/i }));
  await waitFor(() =>
    expect(screen.queryByText("Form published")).not.toBeInTheDocument(),
  );
});

it("removes offcanvas navigation from keyboard and screen-reader access when collapsed", async () => {
  const user = userEvent.setup();
  render(
    <Sidebar.Provider contained collapsible="offcanvas">
      <Sidebar>
        <Sidebar.Menu>
          <Sidebar.MenuButton>Service details</Sidebar.MenuButton>
        </Sidebar.Menu>
      </Sidebar>
      <Sidebar.Trigger />
    </Sidebar.Provider>,
  );
  const item = screen.getByRole("button", { name: "Service details" });
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(
    screen.queryByRole("button", { name: "Service details" }),
  ).not.toBeInTheDocument();
  expect(item.closest("aside")).toHaveAttribute("inert");
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByRole("button", { name: "Service details" })).toBeVisible();
});
