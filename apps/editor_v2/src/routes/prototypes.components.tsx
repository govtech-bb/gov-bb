import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowsSplit,
  ArrowUp,
  At,
  BracketsCurly,
  CalendarBlank,
  CaretCircleDown,
  CaretDown,
  ChatCircle,
  CheckSquare,
  ClockCounterClockwise,
  Code,
  Copy,
  DotsSixVertical,
  Envelope,
  Eye,
  EyeSlash,
  Funnel,
  Hash,
  Info,
  ListBullets,
  ListNumbers,
  MapPin,
  Phone,
  Plus,
  RadioButton,
  SlidersHorizontal,
  TextAlignLeft,
  TextB,
  TextH,
  TextItalic,
  TextOutdent,
  TextT,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { DocumentBar } from "../ui/document-bar";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { Drawer } from "../ui/drawer";
import { cn } from "../cn";
import { visibilityLabels, visibilityTones } from "../pages";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Checkbox } from "../ui/checkbox";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Field, FieldGroup, FieldText } from "../ui/field";
import {
  govbbBox,
  govbbButton,
  govbbCheckbox,
  govbbFieldWidth,
  govbbMarkerLabel,
  govbbOptional,
  govbbRadio,
  govbbSecondaryButton,
  govbbSelect,
  govbbSelectCaret,
} from "../ui/govbb";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Menu } from "../ui/menu";
import { NativeSelect } from "../ui/native-select";
import { Popover } from "../ui/popover";
import { PreviewQuestion, PreviewSheet } from "../ui/preview-sheet";
import { SaveState, type SaveStatus } from "../ui/save-state";
import { Select, type SelectItem } from "../ui/select";
import { SidePanel, useSidePanel } from "../ui/side-panel";
import { Sidebar, useSidebar } from "../ui/sidebar";
import { StatusDot } from "../ui/status-dot";
import { listEmpty, surface } from "../ui/surface";
import { Switch } from "../ui/switch";
import { Tag } from "../ui/tag";
import { LinkAtCaret } from "../ui/link-at-caret";
import { LinkPicker, type LinkPage } from "../ui/link-picker";
import { link, TextLink } from "../ui/text-link";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toast";
import { Tip } from "../ui/tooltip";
import { TurnIntoMenu, TurnIntoSubmenu, type TurnIntoOption } from "../ui/turn-into";

export const Route = createFileRoute("/prototypes/components")({
  head: () => ({ meta: [{ title: "Components · Design preview · GovBB" }] }),
  component: ComponentsPreview,
});

const sections = [
  ["foundations", "Foundations"],
  ["button", "Button"],
  ["link", "Link"],
  ["menu", "Menu"],
  ["popover", "Popover"],
  ["dialog", "Dialog"],
  ["bar", "Bar"],
  ["document-bar", "Document bar"],
  ["save-state", "Save state"],
  ["drawer", "Drawer"],
  ["side-panel", "Side panel"],
  ["sidebar", "Sidebar"],
  ["select", "Select"],
  ["field", "Field"],
  ["checkbox", "Checkbox"],
  ["switch", "Switch"],
  ["badge", "Badge"],
  ["tag", "Tag"],
  ["kbd", "Kbd"],
  ["status-dot", "Status dot"],
  ["messages", "Messages"],
  ["banner", "Banner"],
  ["states", "Empty and loading"],
  ["toast", "Toast"],
  ["preview-sheet", "Preview sheet"],
  ["govbb", "GovBB controls"],
] as const;

/** Every shared component in its states, to try with the mouse and the keyboard. Nothing here is saved. */
function ComponentsPreview() {
  return (
    <div className="min-h-dvh bg-tint pb-24">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-6 pt-12 pb-8">
          <p className="text-14 font-semibold text-muted">Design preview</p>
          <h1 className="mt-1 text-40 leading-tight font-semibold">Components</h1>
          <p className="mt-3 max-w-2xl text-18 leading-normal text-pretty text-muted">
            The editor’s menus, popovers, dialogs, selects, fields and messages, each built once.
            Try them with the mouse, then with the keyboard: arrows move, Enter chooses, Esc closes.
          </p>
          <nav aria-label="Components" className="mt-8 flex flex-wrap gap-2">
            {sections.map(([id, name]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-sm px-3 py-1.5 text-14 font-semibold text-ink shadow-input transition-shadow duration-150 hover:shadow-input-hover"
              >
                {name}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-12">
        <Section
          id="foundations"
          title="Foundations"
          lead="The few sizes everything else is built from."
        >
          <Specimen
            title="Type"
            note="Five steps, each with its own line height. Semibold is the one emphasis."
          >
            <dl className="flex w-full max-w-sm flex-col gap-3">
              {typeSteps.map(([size, use, sample]) => (
                <div
                  key={size}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-4"
                >
                  <dt className="text-12 text-muted tabular-nums">{size}</dt>
                  <dd className={sample}>{use}</dd>
                </div>
              ))}
            </dl>
          </Specimen>
          <Specimen
            title="Control heights"
            note="Buttons and fields share one scale, so a row of them lines up. On a touch screen, each is at least 44px."
          >
            <div className="flex flex-col gap-3">
              {controlSteps.map(([size, px, use]) => (
                <div key={size} className="flex items-center gap-3">
                  <span className="w-20 text-12 text-muted tabular-nums">
                    {px} · {use}
                  </span>
                  <Button size={size} variant="secondary">
                    Button
                  </Button>
                  {(size === "sm" || size === "md") && (
                    <Input
                      size={size}
                      aria-label={`${px} field`}
                      placeholder="Field"
                      className="w-32"
                    />
                  )}
                </div>
              ))}
            </div>
          </Specimen>
          <Specimen title="Spacing" note="A 4px grid, kept to six steps.">
            <dl className="flex w-full max-w-sm flex-col gap-2">
              {spaceSteps.map(([px, use, width]) => (
                <div
                  key={px}
                  className="grid grid-cols-[2.5rem_4rem_minmax(0,1fr)] items-center gap-3"
                >
                  <dt className="text-12 text-muted tabular-nums">{px}</dt>
                  <span className={cn("h-2 rounded-xs bg-blue-40", width)} />
                  <dd className="text-14">{use}</dd>
                </div>
              ))}
            </dl>
          </Specimen>
          <Specimen
            title="Two densities"
            note="Compact in menus and popovers, comfortable in dialogs and panels."
          >
            <div className="grid w-full max-w-md grid-cols-2 gap-6">
              <Field size="sm" label="Compact" hint="32px field, 12px hint">
                <Input size="sm" defaultValue="Continue" />
              </Field>
              <Field label="Comfortable" hint="36px field, 14px hint">
                <Input defaultValue="Renew a passport" />
              </Field>
            </div>
          </Specimen>
        </Section>

        <Section id="button" title="Button" lead="An action, named for what it does.">
          <Specimen
            title="Variants"
            note="One main action, in teal. Grey for the rest, red for what loses work, and a link for an action in a list or a sentence."
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="accent">Publish changes</Button>
              <Button variant="secondary">Cancel</Button>
              <Button>History</Button>
              <Button variant="danger" icon={<Trash />}>
                Delete page
              </Button>
              <Button variant="link">Line 3: Close the details block</Button>
            </div>
          </Specimen>
          <Specimen
            title="On"
            note="A toggle that’s pressed, or the page you’re on, stays selected blue under the pointer."
          >
            <Toggles />
          </Specimen>
          <Specimen
            title="Working"
            note="Keeps its colour while it works, rather than greying out as if the press hadn’t worked, and ignores another press."
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="accent" pending>
                Publishing changes…
              </Button>
              <Button variant="danger" pending>
                Deleting page…
              </Button>
            </div>
          </Specimen>
          <Specimen title="On a dark bar" note="White, with a lighter hover that reads on navy.">
            <div className="flex items-center gap-1 rounded-sm bg-brand-dark p-2">
              <Button variant="inverse" icon={<TextAlignLeft />}>
                Markdown
              </Button>
              <Button variant="inverse">Sign out</Button>
            </div>
          </Specimen>
        </Section>

        <Section
          id="link"
          title="Link"
          lead="Somewhere to go: a screen in the editor, or another site."
        >
          <Specimen
            title="In a sentence"
            note="GovBB’s link: teal and underlined, then ink on a tint under the pointer."
          >
            <p className="max-w-xs text-16 leading-relaxed">
              This service has no pages yet.{" "}
              <TextLink render={<Link to="/prototypes/components" hash="dialog" />}>
                Add a page
              </TextLink>{" "}
              to explain it.
            </p>
          </Specimen>
          <Specimen
            title="To another site"
            note="Opens in a new tab, and says so: an arrow, and the words for screen readers."
          >
            <p className="max-w-xs text-16 leading-relaxed">
              Read the{" "}
              <TextLink external href="https://alpha.gov.bb">
                published service
              </TextLink>{" "}
              before you change it.
            </p>
          </Specimen>
        </Section>

        <Section id="menu" title="Menu" lead="Actions and settings for a block, a row or a page.">
          <Specimen
            title="Block actions"
            note="Icons and shortcuts. Delete is red, and Move out is unavailable here."
          >
            <BlockActions />
          </Specimen>
          <Specimen
            title="Turn into"
            note="What the block is now, and what it can become, each with its shortcut. The toolbar over selected text opens the same list."
          >
            <TurnIntoDemo />
          </Specimen>
          <Specimen
            title="Settings"
            note="Ticks, and submenus that show the current choice. Rows without an icon line up with those that have one."
          >
            <QuestionSettings />
          </Specimen>
          <Specimen
            title="Filter"
            note="Tick as many as you like; the menu stays open. Counts sit at the end of each row."
          >
            <StatusFilter />
          </Specimen>
          <Specimen
            title="Long list"
            note="Grouped under headings, and scrolls once it fills the space."
          >
            <InsertMenu />
          </Specimen>
        </Section>

        <Section id="popover" title="Popover" lead="A small panel for changing something in place.">
          <Specimen
            title="Link at the caret"
            note="Where the link goes, while the caret is in it, with Edit and Remove. Edit finds a page by its title or takes an address. Esc closes it."
          >
            <LinkAtCaretDemo />
          </Specimen>
          <Specimen
            title="Title and description"
            note="Explains a setting, with its own way out. Its title names it."
          >
            <VisibilityPopover />
          </Specimen>
          <Specimen
            title="Placement"
            note="Any side of its trigger. Near the edge of the screen it flips to stay in view."
          >
            <Placements />
          </Specimen>
          <Specimen
            title="Anchored elsewhere"
            note="Placed against the highlighted words rather than the button that opens it."
          >
            <AnchoredPopover />
          </Specimen>
        </Section>

        <Section
          id="dialog"
          title="Dialog"
          lead="For a decision, or work that needs the page’s full attention."
        >
          <Specimen title="Short form" note="Header, fields and the buttons that finish the task.">
            <CreateServiceDialog />
          </Specimen>
          <Specimen
            title="Confirm"
            note="ConfirmDialog asks before what can’t be undone: a click outside does nothing, and it can’t be closed while it works. This one fails once, to show its error."
          >
            <DeletePage />
          </Specimen>
          <Specimen title="Large" note="Room for a list or a longer form.">
            <Dialog.Root>
              <Dialog.Trigger
                render={<Button icon={<ListBullets />}>Bulk insert options</Button>}
              />
              <Dialog.Content size="lg">
                <Dialog.Header>
                  <Dialog.Title>Bulk insert options</Dialog.Title>
                  <Dialog.Description>
                    Type or paste the options, one on each line.
                  </Dialog.Description>
                </Dialog.Header>
                <Dialog.Body>
                  <Textarea
                    rows={8}
                    aria-label="Options, one per line"
                    placeholder={"Barbados\nTrinidad and Tobago\nJamaica"}
                    className="resize-y"
                  />
                </Dialog.Body>
                <Dialog.Actions>
                  <Dialog.Close render={<Button variant="secondary">Cancel</Button>} />
                  <Dialog.Close render={<Button variant="accent">Insert options</Button>} />
                </Dialog.Actions>
              </Dialog.Content>
            </Dialog.Root>
          </Specimen>
          <Specimen title="Full screen" note="For source and other work that wants the whole page.">
            <Dialog.Root>
              <Dialog.Trigger render={<Button icon={<TextAlignLeft />}>Page source</Button>} />
              <Dialog.Content size="full">
                <Dialog.Header>
                  <Dialog.Title>Page source</Dialog.Title>
                  <Dialog.Description>
                    Edit the Markdown, then apply it to the page.
                  </Dialog.Description>
                </Dialog.Header>
                <Dialog.Body className="flex">
                  <Textarea
                    aria-label="Markdown"
                    spellCheck={false}
                    defaultValue={pageSource}
                    className="min-h-60 flex-1 resize-none p-3 font-mono leading-relaxed"
                  />
                </Dialog.Body>
                <Dialog.Actions>
                  <Dialog.Close render={<Button variant="secondary">Cancel</Button>} />
                  <Dialog.Close render={<Button variant="accent">Apply</Button>} />
                </Dialog.Actions>
              </Dialog.Content>
            </Dialog.Root>
          </Specimen>
        </Section>

        <Section
          id="bar"
          title="Bar"
          lead="The strip across the top of a screen, a document or a drawer."
        >
          <Specimen
            wide
            title="Over a document"
            note="Its title, where it stands and its tools, in groups. Named, it's a toolbar. Narrower than 1200 pixels, a tool is its icon, named in a tooltip."
          >
            <div className="w-full overflow-hidden rounded-sm border border-line">
              <Bar.Root label="Page tools">
                <Bar.Title>Renew a passport</Bar.Title>
                <Bar.Status>
                  <SaveState.Status status="unsaved" />
                </Bar.Status>
                <Bar.Actions>
                  {undoRedo}
                  <Bar.Separator />
                  <Bar.Tool icon={<Eye />} label="Preview page" />
                  <Bar.Tool icon={<Code />} label="Markdown" />
                  <Bar.Separator />
                  <Button variant="accent">Publish changes</Button>
                </Bar.Actions>
              </Bar.Root>
            </div>
          </Specimen>
          <Specimen
            wide
            title="The app's header"
            note="GovBB's navy, as tall and inset as every other bar, so their edges line up."
          >
            <div className="w-full overflow-hidden rounded-sm">
              <Bar.Root tone="dark" className="font-semibold">
                <span>Services</span>
                <Bar.Actions>
                  <Bar.Status className="font-normal">employee@govtech.bb</Bar.Status>
                  <Button variant="inverse">Sign out</Button>
                </Bar.Actions>
              </Bar.Root>
            </div>
          </Specimen>
        </Section>

        <Section
          id="document-bar"
          title="Document bar"
          lead="One bar over every page and form, with each tool in the same place."
        >
          <Specimen
            wide
            title="A page"
            note="Its title is the screen's heading. Then where it stands, undo and redo, the ways to look at it, publishing and its settings, in that order."
          >
            <DocumentBarDemo />
          </Specimen>
          <Specimen
            wide
            title="A form"
            note="The slots it has, in the same places: the bar closes up round the rest."
          >
            <div className="w-full overflow-hidden rounded-sm border border-line">
              <DocumentBar
                label="Form tools"
                title="Apply for a permit to play loud music"
                save={{ status: "unsaved" }}
                undo={undoRedo}
                source={
                  <>
                    <Bar.Tool icon={<Code />} label="Markdown" />
                    <Bar.Tool icon={<BracketsCurly />} label="JSON" />
                  </>
                }
              />
            </div>
          </Specimen>
        </Section>

        <Section
          id="save-state"
          title="Save state"
          lead="Where a document's work stands, in words that say who can see it."
        >
          <Specimen
            title="Where it stands"
            note="Edits stay in memory until Save or Publish succeeds. Leaving without saving loses those changes."
          >
            <dl className="flex w-full max-w-sm flex-col gap-3 text-14">
              {saveStates.map(([status, when]) => (
                <div key={status} className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{when}</dt>
                  <dd>
                    <SaveState.Status status={status} />
                  </dd>
                </div>
              ))}
            </dl>
          </Specimen>
          <Specimen
            title="A failed save"
            note="Why, and the way out. Failures, conflicts and saves the author asked for are read out politely; saving between keystrokes is silent."
          >
            <div className="w-full overflow-hidden rounded-sm border border-line">
              <SaveState.Failure
                status="failed"
                error="We could not save this page. Keep the editor open to retry, or download your changes."
                onRetry={() => {}}
                onDownload={() => {}}
              />
            </div>
          </Specimen>
        </Section>

        <Section
          id="drawer"
          title="Drawer"
          lead="A panel over the page from one edge, where a narrow screen has no room beside it."
        >
          <Specimen
            title="From either edge"
            note="Navigation comes from the start edge, a document’s settings from the end. Swipe it away, press Esc or use Close."
          >
            <DrawerDemo />
          </Specimen>
        </Section>

        <Section
          id="side-panel"
          title="Side panel"
          lead="A document’s settings beside its canvas, or a drawer over it on a narrow screen."
        >
          <Specimen
            wide
            title="Settings beside the page"
            note="Sections are titled and ruled off. The toolbar’s toggle hides the panel; narrower than 1200 pixels, it opens as a drawer you can swipe away."
          >
            <SidePanelDemo />
          </Specimen>
        </Section>

        <Section
          id="sidebar"
          title="Sidebar"
          lead="A service’s pages and its form, beside the page you’re working on."
        >
          <Specimen
            wide
            title="A service’s documents"
            note="Groups under labels, pages under the page they belong to, each dotted with how far it’s published, the current page tinted, a rule before the form and the service’s actions underneath. Pages hides the column and gives the page its width; narrower than 992 pixels, it opens as a drawer from the start edge."
          >
            <SidebarDemo />
          </Specimen>
        </Section>

        <Section id="select" title="Select" lead="One value from a list, or several.">
          <Specimen
            title="Field"
            note="Takes its label and hint itself. Starts empty, with groups under headings."
          >
            <div className="w-full max-w-xs">
              <Select
                label="Category"
                hint="Where people find this service."
                placeholder="Choose a category"
                items={categories}
              />
            </div>
          </Specimen>
          <Specimen title="With icons" note="The chosen item’s icon comes with it into the field.">
            <div className="w-full max-w-xs">
              <Select label="Answer" items={answers} defaultValue="text" />
            </div>
          </Specimen>
          <Specimen title="Error" note="Says what’s wrong, and edges the field in red.">
            <div className="w-full max-w-xs">
              <Select
                label="Category"
                error="Choose a category"
                placeholder="Choose a category"
                items={categories}
              />
            </div>
          </Specimen>
          <Specimen title="In a sentence" note="The pill reads as part of the rule it belongs to.">
            <div className="flex max-w-sm flex-col gap-4 text-16 leading-8">
              <p>
                Show this page when{" "}
                <Select
                  variant="pill"
                  aria-label="How many rules"
                  items={quantifiers}
                  defaultValue="any"
                />{" "}
                of the rules below are true.
              </p>
              <p>
                Remind applicants by{" "}
                <Select
                  variant="pill"
                  icon={<Envelope />}
                  aria-label="Reminder channel"
                  items={channels}
                  defaultValue="email"
                />
              </p>
            </div>
          </Specimen>
          <Specimen title="Several values" note="Shows the first choice and how many more.">
            <div className="w-full max-w-xs">
              <Select
                multiple
                label="Visible to"
                placeholder="Nobody yet"
                items={roles}
                defaultValue={["applicants", "caseworkers"]}
              />
            </div>
          </Specimen>
          <Specimen title="Unavailable" note="A whole select, or one of its items.">
            <div className="flex w-full max-w-xs flex-col gap-4">
              <Select label="Status" items={statuses} defaultValue="published" disabled />
              <Select label="Move to" placeholder="Choose a status" items={statuses} />
            </div>
          </Specimen>
        </Section>

        <Section id="field" title="Field" lead="A label for a control, with a hint and an error.">
          <Specimen title="Label and hint" note="The hint says what to enter, under the box.">
            <Field
              label="Service name"
              hint="People see this in search results."
              className="w-full max-w-xs"
            >
              <Input defaultValue="Renew a passport" />
            </Field>
          </Specimen>
          <Specimen
            title="Error"
            note="Says what’s wrong and how to fix it. Focus still shows over the red."
          >
            <Field
              label="Page address"
              error="Use only lowercase letters, numbers and hyphens"
              className="w-full max-w-xs"
            >
              <Input defaultValue="Renew a Passport!" />
            </Field>
          </Specimen>
          <Specimen
            title="Link destination"
            note="Finds a page by its title, ↑ and ↓ to choose, or takes an address typed in full."
          >
            <Field label="Button destination" className="w-full max-w-xs">
              <LinkDestinationDemo />
            </Field>
          </Specimen>
          <Specimen title="Several lines" note="The same frame, for a longer answer.">
            <Field label="Introduction" hint="One or two sentences." className="w-full max-w-xs">
              <Textarea rows={3} placeholder="What this service lets people do" />
            </Field>
          </Specimen>
          <Specimen
            title="Native select"
            note="The browser’s own picker, for a short list of plain options."
          >
            <Field label="Document type" className="w-full max-w-xs">
              <NativeSelect defaultValue="supporting">
                <option value="start">Start page</option>
                <option value="supporting">Supporting page</option>
              </NativeSelect>
            </Field>
          </Specimen>
          <Specimen
            title="Sizes"
            note="Settings and dialogs use the larger. Popovers and toolbars use the smaller."
          >
            <div className="flex w-full max-w-xs flex-col gap-4">
              <Input aria-label="Larger" placeholder="36 pixels tall" />
              <Input size="sm" aria-label="Smaller" placeholder="32 pixels tall" />
            </div>
          </Specimen>
          <Specimen
            title="Read only"
            note="A value set elsewhere, such as by the server: the label over plain text."
          >
            <FieldText label="Publication date" className="w-full max-w-xs">
              12 Oct 2026
            </FieldText>
          </Specimen>
          <Specimen
            title="Several controls"
            note="Chosen items and a picker to add another, under one label. Each control keeps its own name."
          >
            <FiledUnder />
          </Specimen>
          <Specimen title="Unavailable" note="Greyed, and skipped by the keyboard.">
            <Field
              label="Form ID"
              hint="Set when the form is first published."
              disabled
              className="w-full max-w-xs"
            >
              <Input defaultValue="renew-passport-01" />
            </Field>
          </Specimen>
        </Section>

        <Section
          id="checkbox"
          title="Checkbox"
          lead="A choice that’s on or off, saved with the rest."
        >
          <Specimen title="With a label" note="The label ticks the box too.">
            <div className="flex flex-col gap-3">
              <Checkbox label="Higher-risk category" />
              <Checkbox label="Show on the service page" defaultChecked />
            </div>
          </Specimen>
          <Specimen
            title="Partly ticked"
            note="A box over a list shows a dash while only some are ticked."
          >
            <RowSelection />
          </Specimen>
          <Specimen title="Unavailable" note="Its state still shows.">
            <div className="flex flex-col gap-3">
              <Checkbox label="Required" disabled />
              <Checkbox label="Published" disabled defaultChecked />
            </div>
          </Specimen>
        </Section>

        <Section id="switch" title="Switch" lead="A setting that takes effect the moment it flips.">
          <Specimen title="With a label" note="The label flips the switch too.">
            <div className="flex flex-col items-start gap-3">
              <Switch label="Confirmation page" defaultChecked />
              <Switch label="Show the page title" />
            </div>
          </Specimen>
          <Specimen title="Unavailable" note="Its state still shows.">
            <div className="flex flex-col items-start gap-3">
              <Switch label="Confirmation page" disabled defaultChecked />
              <Switch label="Show the page title" disabled />
            </div>
          </Specimen>
        </Section>

        <Section id="badge" title="Badge" lead="A short label for a status or a property.">
          <Specimen title="Tones" note="The words carry the meaning; the tone backs them up.">
            <div className="flex flex-wrap justify-center gap-2">
              <Badge>Draft link only</Badge>
              <Badge tone="info">Imported</Badge>
              <Badge tone="success">Public</Badge>
              <Badge tone="warning">Preview link only</Badge>
              <Badge tone="error">Not saved</Badge>
            </div>
          </Specimen>
          <Specimen title="In a list" note="Beside the thing it describes.">
            <ul className="flex w-full max-w-xs flex-col divide-y divide-line text-14">
              {statusRows.map(([service, status, tone]) => (
                <li key={service} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate">{service}</span>
                  <Badge tone={tone}>{status}</Badge>
                </li>
              ))}
            </ul>
          </Specimen>
        </Section>

        <Section id="tag" title="Tag" lead="Something chosen, with a button to remove it.">
          <Specimen
            title="Removable"
            note="Each remove button is named for what it removes. Long names wrap rather than overflow."
          >
            <FiledUnder />
          </Specimen>
          <Specimen
            title="Tones"
            note="Badge’s tones. Without a remove button, it only shows the choice."
          >
            <div className="flex flex-wrap justify-center gap-1.5">
              <Tag>Business and trade</Tag>
              <Tag tone="neutral">From Markdown</Tag>
              <Tag tone="success">Public</Tag>
              <Tag tone="warning">Preview link only</Tag>
              <Tag tone="error">Not filed</Tag>
            </div>
          </Specimen>
        </Section>

        <Section id="kbd" title="Kbd" lead="A key, or keys pressed together, in a hint or a menu.">
          <Specimen
            title="In a hint"
            note="Keys pressed one after another are a keycap each. Its edge takes the colour of the words around it."
          >
            <p className="flex flex-wrap items-center gap-1 text-12 leading-4 text-muted">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="me-2">to browse</span>
              <Kbd>Enter</Kbd>
              <span>to insert</span>
            </p>
          </Specimen>
          <Specimen
            title="In a tooltip"
            note="Bright among the muted words, like the action it names."
          >
            <Tip
              hint
              content={
                <>
                  <em>Drag</em> to move
                  <br />
                  <em>Click</em> or <Kbd>⌘/</Kbd> for block options
                </>
              }
            >
              <Button icon={<DotsSixVertical />} aria-label="Block options" />
            </Tip>
          </Specimen>
        </Section>

        <Section
          id="status-dot"
          title="Status dot"
          lead="A status in the space of a dot, where a badge won’t fit."
        >
          <Specimen
            title="Tones"
            note="Named on hover and to screen readers. Off is a ring, so it stands apart without its colour."
          >
            <ul className="flex flex-col gap-2 text-14">
              {statusRows.map(([, status, tone]) => (
                <li key={status} className="flex items-center gap-2">
                  <StatusDot tone={tone} label={status} />
                  <span className="text-muted">{status}</span>
                </li>
              ))}
            </ul>
          </Specimen>
          <Specimen title="In a field" note="Beside the words it backs up, so it is left unnamed.">
            <VisibilityDemo />
          </Specimen>
        </Section>

        <Section
          id="messages"
          title="Messages"
          lead="Where each kind of message goes, so an author always finds it in the same place."
        >
          <Specimen
            wide
            title="Where it goes"
            note="The rule in Banner's own notes too. A message goes in its one place, and nowhere else."
          >
            <dl className="grid w-full max-w-3xl gap-x-6 gap-y-4 text-14 sm:grid-cols-[8rem_minmax(0,1fr)]">
              {messagePlaces.map(([kind, place, example]) => (
                <div key={kind} className="contents">
                  <dt className="font-semibold">{kind}</dt>
                  <dd>
                    {place}
                    <span className="block text-muted">“{example}”</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Specimen>
          <Specimen
            title="Done and failed"
            note="What came of acting in a dialog, in the tone of what happened: a failed import never looks like one that worked."
          >
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Banner tone="success">Form imported. Undo returns to your previous form.</Banner>
              <Banner tone="error">
                The file was retained. Correct its errors before importing it.
              </Banner>
            </div>
          </Specimen>
        </Section>

        <Section id="banner" title="Banner" lead="What happened, and what to do about it.">
          <Specimen title="Strip" note="Edge to edge under a toolbar, with its buttons beside it.">
            <div className="w-full overflow-hidden rounded-sm border border-line">
              <Banner
                tone="error"
                layout="strip"
                actions={<Button variant="secondary">Try again</Button>}
              >
                We could not save this page. Keep the editor open to retry, or download your
                changes.
              </Banner>
              <Banner
                tone="warning"
                layout="strip"
                title="Editing is paused"
                actions={<Button variant="secondary">Review Markdown changes</Button>}
              >
                Your Markdown changes haven't been applied.
              </Banner>
            </div>
          </Specimen>
          <Specimen title="Box" note="Inside a dialog or a panel, with its buttons underneath.">
            <Banner
              tone="error"
              title="There is a problem"
              actions={<Button variant="secondary">Review the page</Button>}
              className="w-full max-w-sm"
            >
              <ul className="mt-1 list-disc ps-5">
                <li>Title: Enter a title</li>
                <li>Page address: Use only lowercase letters, numbers and hyphens</li>
              </ul>
            </Banner>
          </Specimen>
          <Specimen title="Tones" note="Each with its own icon, so colour isn’t the only signal.">
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Banner tone="info">This page uses a form from the registry.</Banner>
              <Banner tone="success">The form imported. Undo returns to your previous form.</Banner>
              <Banner tone="warning">A newer version of this page has been saved.</Banner>
              <Banner tone="error">This page is no longer in the content API.</Banner>
            </div>
          </Specimen>
        </Section>

        <Section
          id="states"
          title="Empty and loading"
          lead="What shows where content would be: nothing yet, nothing found, a failure, or the wait."
        >
          <Specimen
            title="Page"
            note="A screen's whole content, its title the screen's heading. Not found has a magnifier."
            wide
          >
            <EmptyState
              kind="not-found"
              size="page"
              title="Document not found"
              description="It may have been deleted, or the address may be wrong."
              actions={<TextLink href="#states">Back to services</TextLink>}
              className="py-0"
            />
          </Specimen>
          <Specimen
            title="Section"
            note="Centred in a table, a card or a dialog, with the action that leads on."
          >
            <EmptyState
              title="No services yet"
              description="Create a service to start adding its pages."
              actions={<Button variant="secondary">Create service</Button>}
              className="py-0"
            />
          </Specimen>
          <Specimen
            title="Failed"
            note="A red warning, read out at once, so it can't pass for an empty list."
          >
            <EmptyState
              kind="failed"
              title="We could not load services"
              description="Check you are still signed in, then try again."
              actions={<Button variant="secondary">Try again</Button>}
              className="py-0"
            />
          </Specimen>
          <Specimen
            title="Inline"
            note="A line in a list or a panel, such as an empty sidebar group."
          >
            <EmptyState size="inline" title="Add an entry page to explain this service." />
          </Specimen>
          <Specimen
            title="Loading"
            note="The trident where the content will be, named for a screen reader."
          >
            <LoadingState label="Loading history…" />
          </Specimen>
          <Specimen
            title="No results in a list"
            note="One line where a popup's search finds nothing."
          >
            <div className={cn(surface, "w-60 py-1")}>
              <p className={listEmpty}>No blocks match</p>
            </div>
          </Specimen>
        </Section>

        <Section id="toast" title="Toast" lead="Confirms an action once its own control has gone.">
          <Specimen
            title="Tones"
            note="Bottom right, above dialogs. Gone after five seconds, or swiped away."
          >
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() =>
                  toast("Changes published", { description: "The page is live on GOV.BB." })
                }
              >
                Publish
              </Button>
              <Button
                onClick={() =>
                  toast("Version 3 restored", {
                    tone: "info",
                    description: "Save to make it the current version.",
                  })
                }
              >
                Restore
              </Button>
              <Button
                onClick={() =>
                  toast("The page could not be deleted", {
                    tone: "error",
                    description: "Check you are still signed in, then try again.",
                  })
                }
              >
                Fail
              </Button>
            </div>
          </Specimen>
          <Specimen
            title="With an action"
            note="One button that undoes what the toast names, then takes the toast away."
          >
            <Button
              onClick={() =>
                toast("Page deleted", {
                  action: { label: "Undo", onClick: () => toast("Page restored") },
                })
              }
            >
              Delete page
            </Button>
          </Specimen>
          <Specimen
            title="A stack"
            note="Older toasts tuck behind the newest. Point at them to spread them out."
          >
            <Button
              onClick={() => {
                for (const title of ["Page deleted", "Changes published", "Version 2 restored"])
                  toast(title);
              }}
            >
              Show three
            </Button>
          </Specimen>
        </Section>

        <Section
          id="preview-sheet"
          title="Preview sheet"
          lead="Shows a block on the page before it goes in, in the insert dialog."
        >
          <Specimen
            title="A block"
            note="Drawn on a white sheet over the grey desk, a step smaller."
          >
            <div className="w-full max-w-sm">
              <PreviewSheet>
                <div className="text-22 leading-[1.3] font-semibold">Your premises</div>
              </PreviewSheet>
            </div>
          </Specimen>
          <Specimen
            title="A question"
            note="Its label, “(optional)” when it is, its hint, then the answer as the form draws it."
          >
            <div className="w-full max-w-sm">
              <PreviewSheet>
                <PreviewQuestion label="Passport number" hint="For example, 502135326" optional>
                  <div data-width="short">
                    <div className={cn("h-(--form-control)", govbbFieldWidth, govbbBox)} />
                  </div>
                </PreviewQuestion>
              </PreviewSheet>
            </div>
          </Specimen>
        </Section>

        <Section
          id="govbb"
          title="GovBB controls"
          lead="GovBB’s own controls, drawn once for the form canvas, the insert previews and a page’s buttons."
        >
          <Specimen
            title="Answers"
            note="The input frame, stopping at a question’s width, and the select with its caret."
          >
            <div className="w-full max-w-sm space-y-4">
              <div data-width="short">
                <div className={cn("h-(--form-control)", govbbFieldWidth, govbbBox)} />
              </div>
              <div className={govbbSelect}>
                <span className="flex-1" />
                <span className={govbbSelectCaret}>
                  <CaretDown weight="fill" className="size-3.5" />
                </span>
              </div>
            </div>
          </Specimen>
          <Specimen
            title="Checkboxes and radios"
            note="Square where people can choose several, round where they choose one."
          >
            <div className="space-y-2 text-(length:--form-text) leading-[1.5]">
              {[govbbCheckbox, govbbRadio].map((marker) => (
                <div key={marker} className="flex items-start gap-4">
                  <span className={marker} />
                  <span className={govbbMarkerLabel}>
                    {marker === govbbRadio ? "One answer" : "Several answers"}
                  </span>
                </div>
              ))}
            </div>
          </Specimen>
          <Specimen
            title="Buttons"
            note="Back and Continue on a form. A page’s Start and action buttons are the same."
          >
            <div className="flex gap-3">
              <span className={govbbSecondaryButton}>Back</span>
              <span className={govbbButton}>Continue</span>
            </div>
          </Specimen>
          <Specimen title="Optional" note="GovBB marks what’s optional, never what’s required.">
            <p className="text-(length:--form-text) leading-[1.5] font-bold">
              Middle name<span className={cn(govbbOptional, "ml-1.5")}>(optional)</span>
            </p>
          </Specimen>
        </Section>
      </main>
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8">
      <h2 id={`${id}-title`} className="text-28 leading-tight font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-16 text-muted">{lead}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Specimen({
  title,
  note,
  wide = false,
  children,
}: {
  title: string;
  note: string;
  /** Across both columns. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <figure
      className={cn(
        "flex flex-col overflow-hidden rounded-sm bg-white shadow-sheet",
        wide && "md:col-span-2",
      )}
    >
      <div className="grid min-h-48 flex-1 place-items-center p-8">{children}</div>
      <figcaption className="border-t border-line px-5 py-4">
        <p className="text-14 font-semibold">{title}</p>
        <p className="mt-0.5 text-14 text-pretty text-muted">{note}</p>
      </figcaption>
    </figure>
  );
}

// Each kind of message, where it goes and an example (Banner)
const messagePlaces = [
  ["The app", "A strip under the app's header", "We could not check your session."],
  [
    "The document",
    "A strip among the document bar's notices",
    "Editing is paused. Your Markdown changes haven't been applied.",
  ],
  [
    "A dialog",
    "A box in the dialog's body, in the tone of the outcome",
    "Form imported. Undo returns to your previous form.",
  ],
  ["A field", "On the field, as its error", "Enter a title"],
  ["Afterwards", "A toast, once the control that did it has gone", "Page deleted"],
] as const;

// Each save state, and when it's seen
const saveStates: [SaveStatus, string][] = [
  ["saving", "Between keystrokes, or sending"],
  ["unsaved", "A page that isn't public, changed"],
  ["saved", "A page that isn't public, saved"],
  ["unpublished", "A public page, changed"],
  ["published", "A public page, published"],
  ["failed", "A save that went wrong"],
  ["paused", "While editing is paused"],
];

const undoRedo = (
  <>
    <Button icon={<ArrowCounterClockwise />} aria-label="Undo" />
    <Button icon={<ArrowClockwise />} aria-label="Redo" disabled />
  </>
);

/** A page's bar, its settings toggle working the panel it would show. */
function DocumentBarDemo() {
  const panel = useSidePanel();

  return (
    <div className="w-full overflow-hidden rounded-sm border border-line">
      <DocumentBar
        label="Page tools"
        title="Renew a passport"
        save={{ status: "unpublished" }}
        undo={undoRedo}
        preview={<Bar.Tool icon={<Eye />} label="Preview page" />}
        source={<Bar.Tool icon={<Code />} label="Markdown" />}
        versions={<Bar.Tool icon={<ClockCounterClockwise />} label="History" />}
        publish={<Button variant="accent">Publish changes</Button>}
        settings={<SidePanel.Toggle panel={panel} label="Page settings" />}
      />
    </div>
  );
}

/** A page's frame in miniature: its bar with the toggle, the page, and its settings. */
function SidePanelDemo() {
  const panel = useSidePanel();

  return (
    <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-line text-14">
      <Bar.Root label="Page tools">
        <Bar.Title>Page editor</Bar.Title>
        <Bar.Actions>
          <SidePanel.Toggle panel={panel} label="Page settings" />
        </Bar.Actions>
      </Bar.Root>
      <div className="flex min-h-96">
        <p className="min-w-0 flex-1 p-6 text-muted">The page you’re writing.</p>
        <SidePanel.Root panel={panel} label="Page settings">
          <SidePanel.Section title="Publishing">
            <Field label="Visibility">
              <NativeSelect
                icon={<span className="size-2 rounded-full bg-green-80" />}
                defaultValue="public"
              >
                <option value="public">Public</option>
                <option value="preview">Preview link only</option>
                <option value="draft">Draft link only</option>
              </NativeSelect>
            </Field>
            <FieldText label="Publication date">12 Oct 2026</FieldText>
          </SidePanel.Section>
          <SidePanel.Section title="Details">
            <Field label="Description" hint="A short summary for listings and search.">
              <Textarea rows={2} defaultValue="How to apply, and what happens next" />
            </Field>
          </SidePanel.Section>
        </SidePanel.Root>
      </div>
    </div>
  );
}

/** A visibility select whose dot follows the choice. */
function VisibilityDemo() {
  const [visibility, setVisibility] = useState("preview");

  return (
    <NativeSelect
      icon={<StatusDot tone={visibilityTones.get(visibility) ?? "neutral"} />}
      value={visibility}
      onChange={(event) => setVisibility(event.target.value)}
      aria-label="Visibility"
    >
      {["public", "preview", "draft"].map((value) => (
        <option key={value} value={value}>
          {visibilityLabels.get(value)}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Opens a drawer from each edge. */
function DrawerDemo() {
  const [side, setSide] = useState<"start" | "end">();

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="secondary" onClick={() => setSide("start")}>
        From the start edge
      </Button>
      <Button variant="secondary" onClick={() => setSide("end")}>
        From the end edge
      </Button>
      <Drawer
        open={!!side}
        onOpenChange={(open) => !open && setSide(undefined)}
        side={side ?? "start"}
        label={side === "end" ? "Page settings" : "Service documents"}
      >
        <p className="p-4 text-muted">What the drawer holds, scrolling under its title row.</p>
      </Drawer>
    </div>
  );
}

/** A service's sidebar beside its page, in miniature, with its toggle in the page's bar. Nothing here navigates. */
function SidebarDemo() {
  const sidebar = useSidebar();
  const [current, setCurrent] = useState("Entry page");

  const item = (name: string, status?: (typeof statusRows)[number], nested?: ReactNode) => (
    <Sidebar.Item
      key={name}
      current={current === name}
      status={status && <StatusDot tone={status[2]} label={status[1]} />}
      nested={nested}
      render={
        <button type="button" className="w-full text-start" onClick={() => setCurrent(name)} />
      }
    >
      {name}
    </Sidebar.Item>
  );

  const [preview, live, draft] = statusRows;

  return (
    <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-line">
      <div className="flex min-h-14 items-center gap-3 border-b border-line ps-4 pe-2 text-14">
        <span className="font-semibold">Apply for a hotel licence</span>
        <Sidebar.Toggle sidebar={sidebar}>Pages</Sidebar.Toggle>
      </div>
      <div className="flex min-h-96">
        <Sidebar.Root sidebar={sidebar} label="Service documents">
          <Sidebar.Header />
          <Sidebar.Content>
            <Sidebar.Group label="Pages">
              {item("Entry page", live)}
              {item("Start page", live)}
              {item("Fees and payment", preview, item("Refunds", draft))}
              {item("Contact the office", draft)}
            </Sidebar.Group>
            <Sidebar.Separator />
            <Sidebar.Group>{item("Application form")}</Sidebar.Group>
            <Sidebar.Actions>
              <Button variant="secondary">Add document</Button>
              <Button>Rename service</Button>
            </Sidebar.Actions>
          </Sidebar.Content>
        </Sidebar.Root>
        <p className="min-w-0 flex-1 p-6 text-14 text-muted">{current}, as you’d write it.</p>
      </div>
    </div>
  );
}

function BlockActions() {
  const [chosen, setChosen] = useState<string>();

  const action = (name: string) => () => setChosen(name);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 rounded-sm bg-white py-2 pe-4 ps-1 shadow-sheet">
        <Menu.Root>
          <Menu.Trigger render={<Button icon={<DotsSixVertical />} aria-label="Block actions" />} />
          <Menu.Content aria-label="Block actions" className="w-64">
            <Menu.Group label="Short answer">
              <Menu.Item icon={<Copy />} detail={<Kbd>⌘D</Kbd>} onClick={action("Duplicate")}>
                Duplicate
              </Menu.Item>
              <Menu.Item icon={<EyeSlash />} detail={<Kbd>⌘⇧H</Kbd>} onClick={action("Hide")}>
                Hide
              </Menu.Item>
              <Menu.Item
                icon={<ArrowsSplit />}
                detail={<Kbd>⌘⇧L</Kbd>}
                onClick={action("Add conditional logic")}
              >
                Add conditional logic
              </Menu.Item>
              <Menu.Item icon={<TextOutdent />} disabled>
                Move out
              </Menu.Item>
            </Menu.Group>
            <Menu.Group>
              <Menu.Item
                icon={<Trash />}
                detail={<Kbd>⌫</Kbd>}
                variant="danger"
                onClick={action("Delete")}
              >
                Delete
              </Menu.Item>
            </Menu.Group>
          </Menu.Content>
        </Menu.Root>
        <span className="text-16 font-semibold">What is your full name?</span>
      </div>
      <p aria-live="polite" className="h-5 text-14 text-muted">
        {chosen && `Chose ${chosen}`}
      </p>
    </div>
  );
}

// A page's line, as Turn into offers it
const textTypes: TurnIntoOption[] = [
  { value: "text", label: "Text", icon: <TextT />, shortcut: "⌘⌥0" },
  { value: "heading", label: "Heading 2", icon: <TextH />, shortcut: "⌘⌥2" },
  { value: "bullets", label: "Bulleted list", icon: <ListBullets />, shortcut: "⌘⇧8" },
  { value: "numbers", label: "Numbered list", icon: <ListNumbers />, shortcut: "⌘⇧7" },
];

function TurnIntoDemo() {
  const [type, setType] = useState("heading");

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 rounded-sm bg-white py-2 pe-4 ps-1 shadow-sheet">
        <Menu.Root>
          <Menu.Trigger render={<Button icon={<DotsSixVertical />} aria-label="Block actions" />} />
          <Menu.Content aria-label="Block actions" className="w-64">
            <Menu.Group>
              <TurnIntoSubmenu value={type} options={textTypes} onValueChange={setType} />
            </Menu.Group>
            <Menu.Group>
              <Menu.Item icon={<Trash />} detail={<Kbd>⌫</Kbd>} variant="danger">
                Delete
              </Menu.Item>
            </Menu.Group>
          </Menu.Content>
        </Menu.Root>
        <span className={type === "heading" ? "text-20 font-semibold" : "text-16"}>
          Who can apply
        </span>
      </div>
      <TurnIntoMenu
        value={type}
        options={textTypes}
        onValueChange={setType}
        trigger={
          <Button iconEnd={<CaretDown />} className="font-normal text-ink">
            <span className="sr-only">Turn into: </span>
            {textTypes.find((option) => option.value === type)?.label}
          </Button>
        }
      />
    </div>
  );
}

const widths = [
  ["short", "Short"],
  ["medium", "Medium"],
  ["long", "Full width"],
] as const;

const kinds = [
  ["text", "Short answer", <TextT key="text" />],
  ["paragraph", "Long answer", <TextAlignLeft key="paragraph" />],
  ["number", "Number", <Hash key="number" />],
  ["email", "Email address", <At key="email" />],
] as const;

function QuestionSettings() {
  const [optional, setOptional] = useState(false);
  const [hint, setHint] = useState(true);
  const [width, setWidth] = useState<string>("medium");
  const [kind, setKind] = useState<string>("text");

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button icon={<SlidersHorizontal />}>Settings</Button>} />
      <Menu.Content aria-label="Question settings" className="w-72">
        <Menu.Group label="Answer">
          <Menu.CheckboxItem checked={optional} onCheckedChange={setOptional}>
            Optional
          </Menu.CheckboxItem>
          <Menu.Sub>
            <Menu.SubTrigger detail={widths.find(([value]) => value === width)?.[1]}>
              Width
            </Menu.SubTrigger>
            <Menu.SubContent aria-label="Width">
              <Menu.RadioGroup value={width} onValueChange={setWidth}>
                {widths.map(([value, label]) => (
                  <Menu.RadioItem key={value} value={value} closeOnClick>
                    {label}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.SubContent>
          </Menu.Sub>
          <TurnIntoSubmenu
            value={kind}
            options={kinds.map(([value, label, icon]) => ({ value, label, icon }))}
            onValueChange={setKind}
          />
        </Menu.Group>
        <Menu.Group label="Help">
          <Menu.CheckboxItem checked={hint} onCheckedChange={setHint}>
            Show a hint
          </Menu.CheckboxItem>
        </Menu.Group>
      </Menu.Content>
    </Menu.Root>
  );
}

const statusCounts = [
  ["Draft", 12],
  ["In review", 4],
  ["Published", 40],
  ["Archived", 3],
] as const;

function StatusFilter() {
  const [chosen, setChosen] = useState<string[]>(["Published"]);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button icon={<Funnel />}>
            {chosen.length ? `Status: ${chosen.length} chosen` : "Status"}
          </Button>
        }
      />
      <Menu.Content aria-label="Filter by status">
        {statusCounts.map(([status, count]) => (
          <Menu.CheckboxItem
            key={status}
            detail={count}
            checked={chosen.includes(status)}
            onCheckedChange={(on) =>
              setChosen(on ? [...chosen, status] : chosen.filter((item) => item !== status))
            }
          >
            {status}
          </Menu.CheckboxItem>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}

const blocks = [
  [
    "Text",
    [
      ["Heading", <TextH key="heading" />],
      ["Paragraph", <TextAlignLeft key="paragraph" />],
      ["Bulleted list", <ListBullets key="bullets" />],
      ["Numbered list", <ListNumbers key="numbers" />],
      ["Notice", <Info key="notice" />],
      ["Details", <CaretCircleDown key="details" />],
    ],
  ],
  [
    "Questions",
    [
      ["Short answer", <TextT key="text" />],
      ["Number", <Hash key="number" />],
      ["Email address", <At key="email" />],
      ["Phone number", <Phone key="phone" />],
      ["Date", <CalendarBlank key="date" />],
      ["One choice", <RadioButton key="radio" />],
      ["Several choices", <CheckSquare key="checkboxes" />],
      ["File upload", <UploadSimple key="file" />],
      ["Address", <MapPin key="address" />],
    ],
  ],
] as const;

function InsertMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button icon={<Plus />}>Insert</Button>} />
      <Menu.Content aria-label="Insert" className="max-h-[min(22rem,var(--available-height))] w-64">
        {blocks.map(([heading, members]) => (
          <Menu.Group key={heading} label={heading}>
            {members.map(([name, icon]) => (
              <Menu.Item key={name} icon={icon}>
                {name}
              </Menu.Item>
            ))}
          </Menu.Group>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}

const regions = ["St Michael", "Christ Church", "St James"];

function RowSelection() {
  const [chosen, setChosen] = useState(["St Michael"]);

  return (
    <div className="flex flex-col gap-3">
      <Checkbox
        label="Every parish"
        checked={chosen.length === regions.length}
        indeterminate={chosen.length > 0 && chosen.length < regions.length}
        onCheckedChange={(checked) => setChosen(checked ? regions : [])}
      />
      <div className="flex flex-col gap-3 ps-6">
        {regions.map((region) => (
          <Checkbox
            key={region}
            label={region}
            checked={chosen.includes(region)}
            onCheckedChange={(checked) =>
              setChosen(checked ? [...chosen, region] : chosen.filter((other) => other !== region))
            }
          />
        ))}
      </div>
    </div>
  );
}

/** Bold and italic toggles, and a pager's numbers with the current page on. */
function Toggles() {
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [page, setPage] = useState(2);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-0.5 rounded-sm bg-white p-1 shadow-popup">
        <Button
          icon={<TextB />}
          aria-label="Bold"
          aria-pressed={bold}
          onClick={() => setBold(!bold)}
        />
        <Button
          icon={<TextItalic />}
          aria-label="Italic"
          aria-pressed={italic}
          onClick={() => setItalic(!italic)}
        />
      </div>
      <nav aria-label="Pages" className="flex gap-1 text-14">
        {[1, 2, 3].map((number) => (
          <Button
            key={number}
            aria-label={`Page ${number}`}
            aria-current={number === page ? "page" : undefined}
            className="min-w-8 tabular-nums"
            onClick={() => setPage(number)}
          >
            {number}
          </Button>
        ))}
      </nav>
    </div>
  );
}

const fileable = [
  "Business and trade",
  "Travel and immigration",
  "Births, deaths, marriages and the registration of a change of name",
];

/** A page's categories, as the side panel files them: Tags to remove, and a select to add another. */
function FiledUnder() {
  const [chosen, setChosen] = useState(fileable.slice(0, 2));

  return (
    <FieldGroup label="Filed under" className="w-full max-w-xs">
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((category) => (
            <li key={category} className="max-w-full">
              <Tag
                removeLabel={`Remove ${category}`}
                onRemove={() => setChosen(chosen.filter((other) => other !== category))}
              >
                {category}
              </Tag>
            </li>
          ))}
        </ul>
      )}
      <NativeSelect
        aria-label="Add category"
        value=""
        onChange={(event) => setChosen([...chosen, event.target.value])}
      >
        <option value="">Add category…</option>
        {fileable.flatMap((category) =>
          chosen.includes(category) ? [] : [<option key={category}>{category}</option>],
        )}
      </NativeSelect>
    </FieldGroup>
  );
}

function VisibilityPopover() {
  const title = useId();

  return (
    <Popover.Root>
      <Popover.Trigger render={<Button icon={<Eye />}>Visibility</Button>} />
      <Popover.Content aria-labelledby={title} className="w-72">
        <Popover.Title id={title}>Public</Popover.Title>
        <Popover.Description>
          Anyone can find this page. Saving it publishes your changes.
        </Popover.Description>
        <Popover.Close
          render={
            <Button size="xs" variant="secondary" className="mt-3">
              Got it
            </Button>
          }
        />
      </Popover.Content>
    </Popover.Root>
  );
}

// Pages a link can find, as a host gives them
const linkPages: LinkPage[] = [
  { title: "Apply for a passport", url: "/travel/apply-for-a-passport" },
  { title: "Passport fees", url: "/travel/passport-fees" },
  { title: "Register a business name", url: "/business/register-a-business-name" },
];

function LinkAtCaretDemo() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [url, setUrl] = useState<string | null>("/travel/passport-fees");
  const [shown, setShown] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <p className="max-w-xs text-16 leading-relaxed">
      Check the{" "}
      {url ? (
        <button type="button" ref={setAnchor} className={link} onClick={() => setShown(true)}>
          passport fees
        </button>
      ) : (
        "passport fees"
      )}{" "}
      before you book an appointment.
      {url && shown && anchor && (
        <LinkAtCaret
          anchor={anchor}
          url={url}
          editing={editing}
          onEditingChange={setEditing}
          onRemove={() => setUrl(null)}
          onClose={() => {
            setEditing(false);
            setShown(false);
          }}
          pages={linkPages}
          toAddress={(typed) => typed.trim() || null}
          onApply={(next) => {
            setUrl(next);
            setEditing(false);
          }}
        />
      )}
    </p>
  );
}

function LinkDestinationDemo() {
  const [value, setValue] = useState("");

  return <LinkPicker value={value} onValueChange={setValue} pages={linkPages} />;
}

const sides = [
  ["top", "Top", "Above the button.", <ArrowUp key="top" />],
  ["right", "Right", "To the right of the button.", <ArrowRight key="right" />],
  ["bottom", "Bottom", "Below the button.", <ArrowDown key="bottom" />],
  ["left", "Left", "To the left of the button.", <ArrowLeft key="left" />],
] as const;

function Placements() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {sides.map(([side, name, where, icon]) => (
        <Popover.Root key={side}>
          <Popover.Trigger
            render={
              <Button variant="secondary" icon={icon}>
                {name}
              </Button>
            }
          />
          <Popover.Content side={side} align="center" aria-label={`${name} popover`}>
            <p className="text-14 whitespace-nowrap">{where}</p>
          </Popover.Content>
        </Popover.Root>
      ))}
    </div>
  );
}

function AnchoredPopover() {
  const words = useRef<HTMLElement>(null);
  const title = useId();

  return (
    <div className="flex max-w-xs flex-col items-start gap-4 text-16 leading-relaxed">
      <p>
        Bring{" "}
        <mark ref={words} className="rounded-xs bg-yellow-20 px-0.5 text-ink">
          two passport photos
        </mark>{" "}
        to your appointment.
      </p>
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button size="xs" variant="secondary" icon={<ChatCircle />}>
              Comment on it
            </Button>
          }
        />
        <Popover.Content
          aria-labelledby={title}
          anchor={words}
          side="top"
          align="start"
          className="w-72"
        >
          <Popover.Title id={title}>Comment</Popover.Title>
          <Popover.Description>
            Are these the same size as the photos for a national ID card?
          </Popover.Description>
        </Popover.Content>
      </Popover.Root>
    </div>
  );
}

/** Delete page behind a ConfirmDialog. The first try fails and the second works, to show both. */
function DeletePage() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = () => {
    setOpen(false);
    setFailed(false);
  };

  return (
    <>
      <Button variant="danger" icon={<Trash />} onClick={() => setOpen(true)}>
        Delete page
      </Button>
      <ConfirmDialog
        open={open}
        onClose={close}
        title="Delete this page?"
        description="Visitors will no longer find it. Its browser draft is kept, so you can restore it."
        confirm="Delete page"
        pendingLabel="Deleting page…"
        pending={pending}
        error={failed && "The page could not be deleted. Try again."}
        onConfirm={() => {
          setPending(true);
          setTimeout(() => {
            setPending(false);

            if (!failed) return setFailed(true);
            close();
            toast("Page deleted");
          }, 1500);
        }}
      />
    </>
  );
}

function CreateServiceDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button variant="accent" icon={<Plus />}>
            Create service
          </Button>
        }
      />
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Create a service</Dialog.Title>
          <Dialog.Description>
            It starts as a draft entry page. You can add a start page and a form later.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body className="flex flex-col gap-5">
          <Field label="Name">
            <Input defaultValue="Renew a passport" />
          </Field>
          <Select label="Category" placeholder="Choose a category" items={categories} />
        </Dialog.Body>
        <Dialog.Actions>
          <Dialog.Close render={<Button variant="secondary">Cancel</Button>} />
          <Dialog.Close render={<Button variant="accent">Create service</Button>} />
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const pageSource = `---
title: Renew a passport
description: Apply to renew a Barbados passport that has expired or is about to.
---

You can renew your passport if it expired less than 5 years ago.

## What you need

- your current passport
- two passport photos
- the fee, paid by card or at the counter
`;

const categories: SelectItem[] = [
  { value: "family", label: "Births, deaths and marriages", group: "People and family" },
  { value: "social", label: "Family and social services", group: "People and family" },
  { value: "health", label: "Health and wellbeing", group: "People and family" },
  { value: "business", label: "Business and trade", group: "Money and work" },
  { value: "tax", label: "Money and tax", group: "Money and work" },
  { value: "work", label: "Work and employment", group: "Money and work" },
  { value: "driving", label: "Driving and transport", group: "Getting around" },
  { value: "travel", label: "Travel and immigration", group: "Getting around" },
];

const answers: SelectItem[] = [
  { value: "text", label: "Short answer", icon: <TextT /> },
  { value: "paragraph", label: "Long answer", icon: <TextAlignLeft /> },
  { value: "number", label: "Number", icon: <Hash /> },
  { value: "email", label: "Email address", icon: <At /> },
  { value: "phone", label: "Phone number", icon: <Phone /> },
  { value: "date", label: "Date", icon: <CalendarBlank /> },
];

const quantifiers: SelectItem[] = [
  { value: "all", label: "all" },
  { value: "any", label: "any" },
];

const channels: SelectItem[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "Text message" },
  { value: "both", label: "Email and text message" },
];

const roles: SelectItem[] = [
  { value: "applicants", label: "Applicants" },
  { value: "caseworkers", label: "Caseworkers" },
  { value: "supervisors", label: "Supervisors" },
  { value: "administrators", label: "Administrators" },
];

const statuses: SelectItem[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "In review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived", disabled: true },
];

const statusRows = [
  ["Apply for a hotel licence", "Preview link only", "warning"],
  ["Get a copy of a birth certificate", "Public", "success"],
  ["What prescription colours mean", "Draft link only", "neutral"],
] as const;

const typeSteps = [
  ["28 / 36", "Page titles", "text-28 font-semibold"],
  ["20 / 28", "Dialog and panel titles", "text-20 font-semibold"],
  ["16 / 24", "Lead and empty-state titles", "text-16 font-semibold"],
  ["14 / 20", "Labels, fields, menus and body text", "text-14"],
  ["12 / 16", "Hints in menus, group labels, badges", "text-12 text-muted"],
] as const;

const controlSteps = [
  ["xs", "24px", "Rail"],
  ["sm", "32px", "Toolbar"],
  ["md", "36px", "Form"],
  ["lg", "40px", "Page"],
] as const;

const spaceSteps = [
  ["4", "Icon to its text", "w-1"],
  ["8", "Label to field, button to button", "w-2"],
  ["12", "Inside a row or a box", "w-3"],
  ["16", "Field to field, panel padding", "w-4"],
  ["24", "Section to section, dialog padding", "w-6"],
  ["32", "Page sections", "w-8"],
] as const;
