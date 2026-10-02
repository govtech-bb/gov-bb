import { useState, type ReactNode } from "react";
import {
  CheckCircleIcon,
  FileTextIcon,
  FunnelSimpleIcon,
  GearSixIcon,
  GridFourIcon,
  HouseIcon,
  InfoIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import {
  Autocomplete,
  Badge,
  Banner,
  Breadcrumbs,
  Button,
  Checkbox,
  ClipboardText,
  CodeBlock,
  Collapsible,
  Combobox,
  CommandPalette,
  DatePicker,
  DateRangePicker,
  Dialog,
  DropdownMenu,
  Empty,
  Elevated,
  Field,
  Flow,
  Form,
  Grid,
  GridItem,
  Input,
  InputArea,
  InputGroup,
  Label,
  LayerCard,
  Link,
  Loader,
  MenuBar,
  Meter,
  Pagination,
  Popover,
  Radio,
  Select,
  ScrollArea,
  SensitiveInput,
  Sidebar,
  SkeletonLine,
  Surface,
  SurfaceProvider,
  Switch,
  Table,
  TableOfContents,
  Tabs,
  TagInput,
  Text,
  ToastProvider,
  Toolbar,
  Tooltip,
  TooltipProvider,
  useToastManager,
  type DateRange,
} from "./ui";
import { CodeHighlighted, ShikiProvider } from "./ui/code-highlighted";
export const categories = [
  "Form pattern",
  "Colors",
  "Buttons",
  "Text fields",
  "Choices",
  "Selection",
  "Dates",
  "Overlays",
  "Feedback",
  "Navigation",
  "Surfaces",
  "Scrollbars",
  "Data and content",
] as const;
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={title.toLowerCase().replaceAll(" ", "-")}
      className="scroll-mt-8"
    >
      <h2 className="mb-4 text-lg font-semibold text-ui-default">{title}</h2>
      <div className="rounded-xl bg-ui-base p-5 ring ring-ui-hairline sm:p-8">
        {children}
      </div>
    </section>
  );
}
function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="text-sm font-medium text-ui-subtle">{title}</h3>
      {children}
    </div>
  );
}
const colorRoles = [
  {
    title: "Surfaces",
    tokens: [
      ["bg-ui-canvas", "Page background"],
      ["bg-ui-base", "Default component"],
      ["bg-ui-elevated", "Raised layer"],
      ["bg-ui-recessed", "Inset track"],
      ["bg-ui-tint", "Hover or subtle fill"],
      ["bg-ui-contrast", "Inverted surface"],
    ],
  },
  {
    title: "Brand and controls",
    tokens: [
      ["bg-ui-brand", "Primary action"],
      ["bg-ui-brand-hover", "Primary hover"],
      ["bg-ui-control", "Input background"],
      ["bg-ui-control-hover", "Control hover"],
      ["bg-ui-focus", "Keyboard focus"],
      ["bg-ui-hairline", "Surface boundary"],
      ["bg-ui-line", "Control boundary"],
    ],
  },
  {
    title: "Status fills",
    tokens: [
      ["bg-ui-info", "Information"],
      ["bg-ui-success", "Success"],
      ["bg-ui-warning", "Warning"],
      ["bg-ui-danger", "Destructive or error"],
      ["bg-ui-info-tint", "Information background"],
      ["bg-ui-success-tint", "Success background"],
      ["bg-ui-warning-tint", "Warning background"],
      ["bg-ui-danger-tint", "Error background"],
    ],
  },
] as const;

function ColorExamples() {
  return (
    <div className="space-y-7">
      <p className="max-w-prose text-sm text-ui-subtle">
        Choose a color by its job. These tokens adapt to the appearance selected
        above; components do not need dark-mode classes.
      </p>
      {colorRoles.map((group) => (
        <Example key={group.title} title={group.title}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.tokens.map(([token, purpose]) => (
              <div
                key={token}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-ui-hairline p-3"
              >
                <span
                  aria-hidden="true"
                  className={`${token} size-9 shrink-0 rounded-md ring ring-ui-hairline`}
                />
                <div className="min-w-0">
                  <code className="break-all text-xs">{token}</code>
                  <p className="mt-1 text-xs text-ui-subtle">{purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </Example>
      ))}
      <Example title="Text roles">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            "text-ui-default",
            "text-ui-strong",
            "text-ui-subtle",
            "text-ui-inactive",
            "text-ui-placeholder",
            "text-ui-link",
            "text-ui-info",
            "text-ui-success",
            "text-ui-warning",
            "text-ui-danger",
          ].map((token) => (
            <div
              key={token}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-ui-hairline p-3"
            >
              <span
                aria-hidden="true"
                className={`${token} text-xl font-medium`}
              >
                Aa
              </span>
              <code className="break-all text-xs">{token}</code>
            </div>
          ))}
          <div className="rounded-lg bg-ui-contrast p-3 text-ui-inverse">
            <code className="text-xs">text-ui-inverse</code>
          </div>
        </div>
      </Example>
      <Example title="Status text and fill belong together">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg bg-ui-info-tint p-3 text-ui-info">
            <InfoIcon aria-hidden="true" size={18} /> Applications open next
            week
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-ui-success-tint p-3 text-ui-success">
            <CheckCircleIcon aria-hidden="true" size={18} /> Changes saved
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-ui-warning-tint p-3 text-ui-warning">
            <WarningIcon aria-hidden="true" size={18} /> Review before
            publishing
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-ui-danger-tint p-3 text-ui-danger">
            <WarningCircleIcon aria-hidden="true" size={18} /> Enter a service
            title
          </div>
        </div>
      </Example>
    </div>
  );
}

export function ElevationExamples() {
  return (
    <SurfaceProvider value={1}>
      <div className="space-y-6">
        <p className="max-w-prose text-sm text-ui-subtle">
          Eight levels of depth. Menus rise two levels; dialogs rise four.
          Nested panels follow their surrounding surface while keeping the same
          shadow weight.
        </p>
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          aria-label="Surface levels"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
            <Elevated key={level} offset={level - 1} className="rounded-xl p-4">
              <span className="font-medium">Level {level}</span>
              <p className="mt-2 text-xs text-ui-subtle">Surface and shadow</p>
            </Elevated>
          ))}
        </div>
        <Dialog.Root>
          <Dialog.Trigger render={<Button />}>
            Open surface dialog
          </Dialog.Trigger>
          <Dialog>
            <Dialog.Title>Nested surfaces</Dialog.Title>
            <Dialog.Description>
              This dialog is at level 5. Open a menu inside it to see the next
              level.
            </Dialog.Description>
            <div className="mt-5">
              <Popover>
                <Popover.Trigger render={<Button />}>
                  Open surface menu
                </Popover.Trigger>
                <Popover.Content className="w-72">
                  <Popover.Title>Menu at level 7</Popover.Title>
                  <p className="mt-1 mb-4 text-sm text-ui-subtle">
                    Its select rises to level 8.
                  </p>
                  <Select
                    label="Surface role"
                    placeholder="Choose a role"
                    items={[
                      { value: "reviewer", label: "Reviewer" },
                      { value: "editor", label: "Editor" },
                      { value: "owner", label: "Owner" },
                    ]}
                  />
                </Popover.Content>
              </Popover>
            </div>
          </Dialog>
        </Dialog.Root>
      </div>
    </SurfaceProvider>
  );
}

export function ScrollbarExamples() {
  const services = [
    "Birth certificate",
    "School transport",
    "Vehicle registration",
    "Business registration",
    "Housing assistance",
    "Planning application",
    "Library membership",
    "Public records",
    "Travel document",
    "Student grant",
    "Community support",
    "Waste collection",
  ];
  return (
    <div className="space-y-7">
      <p className="max-w-prose text-sm text-ui-subtle">
        Scrollbars remain visible when content overflows. Edge fades follow the
        scroll position, and touch devices use their native scrollbars.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Example title="Vertical">
          <ScrollArea
            aria-label="Government services"
            className="h-52 rounded-lg border border-ui-hairline"
            viewportClassName="scroll-fade"
          >
            <ul className="divide-y divide-ui-hairline px-4">
              {services.map((service) => (
                <li key={service} className="py-3">
                  {service}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </Example>
        <Example title="Both directions">
          <ScrollArea
            aria-label="Application activity"
            orientation="both"
            className="h-52 rounded-lg border border-ui-hairline"
            viewportClassName="scroll-fade scroll-fade-x"
          >
            <table className="w-[640px] text-left text-sm">
              <thead>
                <tr>
                  {["Service", "Status", "Owner", "Received"].map((title) => (
                    <th
                      key={title}
                      className="border-b border-ui-hairline p-3 font-medium"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service} className="border-b border-ui-hairline">
                    <td className="p-3">{service}</td>
                    <td className="p-3">In review</td>
                    <td className="p-3">Service team</td>
                    <td className="p-3">9 September</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </Example>
      </div>
      <Example title="Horizontal">
        <ScrollArea
          aria-label="Reporting months"
          orientation="horizontal"
          className="w-full rounded-lg border border-ui-hairline"
          viewportClassName="scroll-fade-x"
        >
          <div className="flex w-max gap-3 p-4">
            {[
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ].map((month) => (
              <div
                key={month}
                className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-ui-recessed"
              >
                {month}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Example>
    </div>
  );
}

export function FormPattern() {
  const [status, setStatus] = useState("");
  return (
    <Form
      aria-label="Service settings example"
      className="grid gap-6"
      onFormSubmit={() => setStatus("Settings saved in this example.")}
      onReset={() => setStatus("")}
    >
      <div className="max-w-prose">
        <h3 className="text-base font-semibold">Set up a government service</h3>
        <p className="mt-1 text-sm text-ui-subtle">
          Use the same controls for service details, choices, and validation.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          name="serviceTitle"
          label="Service title"
          placeholder="School transport application"
          description="Use the name applicants will recognise."
          required
          error={{ message: "Enter a service title.", match: "valueMissing" }}
        />
        <Select
          name="serviceDepartment"
          label="Responsible department"
          placeholder="Choose a department"
          items={{
            education: "Education",
            health: "Health",
            transport: "Transport",
          }}
          required
          error={{ message: "Choose a department.", match: "valueMissing" }}
        />
      </div>
      <Switch
        name="emailReceipts"
        label="Send an email receipt after submission"
        defaultChecked
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-ui-hairline pt-5">
        <Button type="submit" variant="primary">
          Save settings
        </Button>
        <Button type="reset" variant="ghost">
          Reset example
        </Button>
        <p role="status" className="text-sm text-ui-success">
          {status}
        </p>
      </div>
    </Form>
  );
}

export function ButtonExamples() {
  return (
    <div className="space-y-7">
      <Example title="Variants">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Create form</Button>
          <Button>Save draft</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="outline">Preview</Button>
          <Button variant="destructive">Delete form</Button>
          <Button variant="secondary-destructive">Remove field</Button>
        </div>
      </Example>
      <Example title="Sizes and shapes">
        <div className="flex flex-wrap items-center gap-3">
          {(["xs", "sm", "base", "lg"] as const).map((size) => (
            <Button key={size} size={size}>
              {size}
            </Button>
          ))}
          <Button icon={PlusIcon} shape="square" aria-label="Add a field" />
          <Button icon={PlusIcon} shape="circle" aria-label="Add a section" />
          <Button icon={PlusIcon} variant="primary">
            Add field
          </Button>
        </div>
      </Example>
      <Example title="States">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Unavailable</Button>
          <Button variant="primary" loading>
            Saving
          </Button>
        </div>
      </Example>
    </div>
  );
}
function TextFieldExamples() {
  return (
    <div className="grid gap-7 sm:grid-cols-2">
      <Input
        label="Form title"
        placeholder="School transport application"
        description="Shown to applicants."
      />
      <Input label="Invalid input" defaultValue="" error="Enter a title." />
      <Input
        label="Disabled input"
        defaultValue="Managed automatically"
        disabled
      />
      <Input label="Read-only input" defaultValue="application-001" readOnly />
      <InputArea
        label="Description"
        placeholder="Explain what this form is for."
        description="Include information that helps applicants."
      />
      <div className="space-y-4">
        <SensitiveInput label="Access key" defaultValue="example-key-12345" />
        <ClipboardText text="forms.gov.bb/application" />
      </div>
      <InputGroup label="Form address">
        <InputGroup.Addon>forms.gov.bb/</InputGroup.Addon>
        <InputGroup.Input aria-label="Form address" placeholder="application" />
      </InputGroup>
      <Field
        label="Field composition"
        description="A reusable label, control, and description."
      >
        <Input aria-label="Field composition" placeholder="Enter a value" />
      </Field>
      <Example title="Input sizes">
        <div className="space-y-3">
          {(["sm", "base", "lg"] as const).map((size) => (
            <Input
              key={size}
              size={size}
              aria-label={`${size} input`}
              placeholder={`${size} input`}
            />
          ))}
        </div>
      </Example>
      <Example title="Label">
        <Label
          htmlFor="standalone-label"
          showOptional
          tooltip="Only used to help identify this form."
        >
          Reference
        </Label>
        <Input
          id="standalone-label"
          aria-label="Reference"
          placeholder="Internal reference"
        />
      </Example>
    </div>
  );
}
function ChoiceExamples() {
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [audience, setAudience] = useState("residents");
  return (
    <div className="grid gap-8 sm:grid-cols-3">
      <div className="flex flex-col items-start gap-3">
        <Checkbox
          label="Required field"
          checked={checked}
          onCheckedChange={setChecked}
        />
        <Checkbox label="Optional field" />
        <Checkbox label="Some fields selected" indeterminate />
        <Checkbox label="Locked field" checked disabled />
        <Checkbox label="Accept the terms" variant="error" />
      </div>
      <Radio.Group
        legend="Who can apply?"
        value={audience}
        onValueChange={setAudience}
      >
        <Radio.Item label="Residents" value="residents" />
        <Radio.Item label="Everyone" value="everyone" />
        <Radio.Item label="Archived" value="archived" disabled />
      </Radio.Group>
      <div className="space-y-5">
        <Switch
          label="Accept applications"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Switch label="Allow late submissions" />
        <Switch label="Managed setting" checked disabled />
      </div>
      <div className="sm:col-span-3">
        <Radio.Group
          legend="Submission method"
          appearance="card"
          orientation="horizontal"
          defaultValue="online"
        >
          <Radio.Item
            label="Online"
            description="Apply directly through the form."
            value="online"
          />
          <Radio.Item
            label="In person"
            description="Submit your application at an office."
            value="office"
          />
        </Radio.Group>
      </div>
    </div>
  );
}
const departments = ["Education", "Health", "Registration", "Transport"];
const departmentItems = departments.map((value) => ({ value, label: value }));
export function SelectionExamples() {
  const [department, setDepartment] = useState<string | null>("Education");
  const [tags, setTags] = useState(["Application", "Public"]);
  return (
    <div className="grid gap-7 sm:grid-cols-2">
      <Select
        label="Department"
        value={department}
        onValueChange={setDepartment}
        items={departmentItems}
      />
      <Select
        label="Disabled department"
        disabled
        items={departmentItems}
        defaultValue="Health"
      />
      <Combobox
        items={departments}
        value={department}
        onValueChange={setDepartment}
        label="Find a department"
      >
        <Combobox.TriggerInput placeholder="Search departments" />
        <Combobox.Content>
          <Combobox.Empty />
          <Combobox.List>
            {(item: string) => (
              <Combobox.Item key={item} value={item}>
                {item}
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
      <Autocomplete items={departments} label="Search departments">
        <Autocomplete.InputGroup placeholder="Type a department" />
        <Autocomplete.Content>
          <Autocomplete.List>
            {(item: string) => (
              <Autocomplete.Item key={item} value={item}>
                {item}
              </Autocomplete.Item>
            )}
          </Autocomplete.List>
        </Autocomplete.Content>
      </Autocomplete>
      <div className="sm:col-span-2">
        <TagInput
          label="Tags"
          value={tags}
          onValueChange={setTags}
          placeholder="Add a tag"
          description="Separate tags with a comma or press Enter."
        />
      </div>
    </div>
  );
}
function DateExamples() {
  const [date, setDate] = useState<Date>(new Date(2026, 8, 16));
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [range, setRange] = useState<DateRange>({
    from: new Date(2026, 8, 14),
    to: new Date(2026, 8, 18),
  });
  return (
    <div className="flex flex-wrap gap-10">
      <Example title="DatePicker">
        <DatePicker
          mode="single"
          required
          selected={date}
          onChange={setDate}
          defaultMonth={new Date(2026, 8)}
        />
      </Example>
      <Example title="Date range">
        <DatePicker
          mode="range"
          required
          selected={range}
          onChange={setRange}
          defaultMonth={new Date(2026, 8)}
        />
      </Example>
      <Example title="DateRangePicker">
        <DateRangePicker
          onStartDateChange={setRangeStart}
          onEndDateChange={setRangeEnd}
          timezone="Barbados (GMT-4)"
        />
        <p className="text-sm text-ui-subtle">
          {rangeStart ? rangeStart.toLocaleDateString() : "Start date"} –{" "}
          {rangeEnd ? rangeEnd.toLocaleDateString() : "End date"}
        </p>
      </Example>
    </div>
  );
}
const commands = [
  { id: "new", title: "Create a form" },
  { id: "find", title: "Find a submission" },
  { id: "settings", title: "Open settings" },
];
export function OverlayExamples() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("No action selected.");
  const [sort, setSort] = useState("newest");
  const select = (title: string) => {
    setResult(`${title} selected.`);
    setOpen(false);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Dialog.Root>
          <Dialog.Trigger render={<Button />}>Review form</Dialog.Trigger>
          <Dialog>
            <Dialog.Title>Review your form</Dialog.Title>
            <Dialog.Description className="mt-2">
              Check the details before sharing this form.
            </Dialog.Description>
            <div className="mt-6">
              <Input label="Review note" placeholder="Add a note" />
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Dialog.Close render={<Button />}>Cancel review</Dialog.Close>
              <Dialog.Close
                render={<Button variant="primary" />}
                onClick={() => setResult("Form reviewed.")}
              >
                Complete review
              </Dialog.Close>
            </div>
          </Dialog>
        </Dialog.Root>
        <Popover>
          <Popover.Trigger render={<Button />}>Sharing details</Popover.Trigger>
          <Popover.Content>
            <Popover.Title>Anyone with the link</Popover.Title>
            <Popover.Description>
              Applicants can open this form from its public address.
            </Popover.Description>
          </Popover.Content>
        </Popover>
        <DropdownMenu>
          <DropdownMenu.Trigger render={<Button />}>
            Form actions
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item onClick={() => setResult("Form duplicated.")}>
              Duplicate form
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled>
              Restore archived version
            </DropdownMenu.Item>
            <DropdownMenu.CheckboxItem
              closeOnClick={false}
              onCheckedChange={(checked) =>
                setResult(
                  checked ? "Archived forms shown." : "Archived forms hidden.",
                )
              }
            >
              Show archived forms
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>Sort responses</DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent side="right" align="start">
                <DropdownMenu.RadioGroup
                  value={sort}
                  onValueChange={(value) => {
                    setSort(value);
                    setResult(
                      value === "newest"
                        ? "Newest responses first."
                        : "Oldest responses first.",
                    );
                  }}
                >
                  <DropdownMenu.RadioItem value="newest">
                    Newest first
                    <DropdownMenu.RadioItemIndicator />
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="oldest">
                    Oldest first
                    <DropdownMenu.RadioItemIndicator />
                  </DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              variant="danger"
              onClick={() => setResult("Form archived.")}
            >
              Archive form
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
        <Tooltip
          content="Add a field"
          render={
            <Button
              icon={PlusIcon}
              shape="square"
              aria-label="Add a field from a tooltip"
            />
          }
        />
        <Button icon={MagnifyingGlassIcon} onClick={() => setOpen(true)}>
          Search commands
        </Button>
      </div>
      <CommandPalette.Root
        open={open}
        onOpenChange={setOpen}
        items={commands.filter((item) =>
          item.title.toLowerCase().includes(search.toLowerCase()),
        )}
        value={search}
        onValueChange={setSearch}
        itemToStringValue={(item) => item.title}
        getSelectableItems={(items) => items}
        onSelect={(item) => select(item.title)}
      >
        <CommandPalette.Input
          aria-label="Search commands"
          placeholder="Search actions…"
        />
        <CommandPalette.List>
          <CommandPalette.Results>
            {(item: (typeof commands)[number]) => (
              <CommandPalette.Item
                key={item.id}
                value={item}
                onClick={() => select(item.title)}
              >
                {item.title}
              </CommandPalette.Item>
            )}
          </CommandPalette.Results>
          <CommandPalette.Empty>No commands found.</CommandPalette.Empty>
        </CommandPalette.List>
      </CommandPalette.Root>
      <p role="status" className="text-sm text-ui-subtle">
        {result}
      </p>
    </div>
  );
}
function ToastButtons() {
  const toast = useToastManager();
  return (
    <div className="flex flex-wrap gap-3">
      {(["info", "success", "error"] as const).map((variant) => (
        <Button
          key={variant}
          onClick={() =>
            toast.add({
              title:
                variant === "success"
                  ? "Form saved"
                  : variant === "error"
                    ? "Unable to save"
                    : "Draft updated",
              description: "Example notification.",
              type: variant,
              timeout: variant === "error" ? 0 : 5000,
            })
          }
        >
          {variant} toast
        </Button>
      ))}
    </div>
  );
}
function FeedbackExamples() {
  return (
    <div className="space-y-7">
      <Example title="Badge">
        <div className="flex flex-wrap gap-2">
          {(
            [
              "primary",
              "secondary",
              "outline",
              "success",
              "error",
              "beta",
            ] as const
          ).map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Example>
      <Example title="Banner">
        <div className="space-y-3">
          <Banner
            icon={<InfoIcon weight="fill" />}
            title="Draft saved"
            description="You can continue editing at any time."
          />
          <Banner
            icon={<WarningIcon weight="fill" />}
            variant="alert"
            title="Review required"
            description="Check the required fields before publishing."
          />
          <Banner
            icon={<WarningCircleIcon weight="fill" />}
            variant="error"
            title="Unable to publish"
            description="Add a title to continue."
          />
          <Banner
            variant="secondary"
            title="Your form is private"
            description="Share the form when it is ready."
          />
        </div>
      </Example>
      <Example title="Toast">
        <ToastProvider>
          <ToastButtons />
        </ToastProvider>
      </Example>
      <div className="grid gap-7 sm:grid-cols-2">
        <Example title="Loader">
          <div className="flex items-center gap-4">
            <Loader />
            <Loader size="lg" />
            <SkeletonLine
              className="w-36"
              minWidth={100}
              maxWidth={100}
              minDuration={1.5}
              maxDuration={1.5}
              minDelay={0}
              maxDelay={0}
            />
          </div>
        </Example>
        <Example title="Meter">
          <Meter value={64} label="Storage used" />
        </Example>
      </div>
    </div>
  );
}
export function NavigationExamples() {
  const [tab, setTab] = useState("fields");
  const [page, setPage] = useState(1);
  const [view, setView] = useState(0);
  const [sidebarPage, setSidebarPage] = useState("Overview");
  const [tocSection, setTocSection] = useState("navigation");
  const tabs = [
    { value: "fields", label: "Fields" },
    { value: "responses", label: "Responses" },
    { value: "settings", label: "Settings" },
  ];
  return (
    <div className="space-y-7">
      <Example title="Breadcrumbs">
        <Breadcrumbs>
          <Breadcrumbs.Link href="#">Workspace</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Link href="#">Forms</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>Transport application</Breadcrumbs.Current>
        </Breadcrumbs>
      </Example>
      <Example title="Tabs">
        <div className="space-y-5">
          <Tabs
            variant="underline"
            tabs={tabs}
            value={tab}
            onValueChange={setTab}
          />
          <Tabs
            variant="segmented"
            tabs={tabs}
            value={tab}
            onValueChange={setTab}
          />
        </div>
      </Example>
      <Example title="Toolbar">
        <Toolbar className="w-full max-w-md">
          <Toolbar.InputGroup aria-label="Search forms" className="flex-1">
            <InputGroup.Addon>
              <MagnifyingGlassIcon />
            </InputGroup.Addon>
            <InputGroup.Input placeholder="Search forms" />
          </Toolbar.InputGroup>
          <Toolbar.Button icon={FunnelSimpleIcon} aria-label="Filter forms" />
          <Toolbar.Button icon={GearSixIcon} aria-label="Form settings" />
        </Toolbar>
      </Example>
      <Example title="MenuBar">
        <div className="w-fit">
          <MenuBar
            className="h-8.5"
            isActive={view}
            options={[
              {
                icon: <ListIcon />,
                tooltip: "List view",
                onClick: () => setView(0),
              },
              {
                icon: <GridFourIcon />,
                tooltip: "Grid view",
                onClick: () => setView(1),
              },
            ]}
          />
        </div>
      </Example>
      <Example title="Pagination">
        <Pagination
          page={page}
          setPage={setPage}
          perPage={10}
          totalCount={100}
        />
      </Example>
      <div className="grid gap-7 sm:grid-cols-2">
        <Example title="TableOfContents">
          <TableOfContents>
            <TableOfContents.Title>On this page</TableOfContents.Title>
            <TableOfContents.List>
              <TableOfContents.Item
                active={tocSection === "buttons"}
                onClick={() => setTocSection("buttons")}
                render={<a href="#buttons" />}
              >
                Buttons
              </TableOfContents.Item>
              <TableOfContents.Item
                active={tocSection === "navigation"}
                onClick={() => setTocSection("navigation")}
                render={<a href="#navigation" />}
              >
                Navigation
              </TableOfContents.Item>
              <TableOfContents.Item
                active={tocSection === "surfaces"}
                onClick={() => setTocSection("surfaces")}
                render={<a href="#surfaces" />}
              >
                Surfaces
              </TableOfContents.Item>
            </TableOfContents.List>
          </TableOfContents>
        </Example>
        <Example title="Link">
          <Link href="https://ui-ui.com" target="_blank" rel="noreferrer">
            Component documentation
          </Link>
        </Example>
      </div>
      <Example title="Sidebar">
        <div className="relative h-72 overflow-hidden rounded-lg ring ring-ui-hairline">
          <Sidebar.Provider contained defaultOpen className="h-full">
            <Sidebar>
              <Sidebar.Content>
                <Sidebar.Group>
                  <Sidebar.GroupLabel>Workspace</Sidebar.GroupLabel>
                  <Sidebar.Menu>
                    <Sidebar.MenuButton
                      icon={HouseIcon}
                      active={sidebarPage === "Overview"}
                      onClick={() => setSidebarPage("Overview")}
                    >
                      Overview
                    </Sidebar.MenuButton>
                    <Sidebar.MenuButton
                      icon={FileTextIcon}
                      active={sidebarPage === "Forms"}
                      onClick={() => setSidebarPage("Forms")}
                    >
                      Forms
                    </Sidebar.MenuButton>
                    <Sidebar.MenuButton
                      icon={GearSixIcon}
                      active={sidebarPage === "Settings"}
                      onClick={() => setSidebarPage("Settings")}
                    >
                      Settings
                    </Sidebar.MenuButton>
                  </Sidebar.Menu>
                </Sidebar.Group>
              </Sidebar.Content>
            </Sidebar>
            <div className="min-w-0 flex-1 bg-ui-canvas p-4">
              <Sidebar.Trigger />
              <p className="mt-4 text-sm text-ui-subtle">{sidebarPage}</p>
            </div>
          </Sidebar.Provider>
        </div>
      </Example>
    </div>
  );
}
function SurfaceExamples() {
  return (
    <div className="space-y-7">
      <Example title="LayerCard">
        <LayerCard>
          <LayerCard.Secondary>
            <CheckCircleIcon />
            Application settings
          </LayerCard.Secondary>
          <LayerCard.Primary>
            <Text bold>School transport application</Text>
            <Text variant="secondary">
              Collect requests for transport to school.
            </Text>
          </LayerCard.Primary>
          <LayerCard.Secondary>
            <span className="flex-1">Last saved just now</span>
            <Button size="sm">Edit details</Button>
          </LayerCard.Secondary>
        </LayerCard>
      </Example>
      <Example title="Grid and Surface">
        <Grid variant="2up">
          <GridItem>
            <Surface className="rounded-lg p-4">
              <Text bold>24 submissions</Text>
              <p className="mt-1 text-ui-subtle">Received this month</p>
            </Surface>
          </GridItem>
          <GridItem>
            <Surface className="rounded-lg p-4">
              <Text bold>3 active forms</Text>
              <p className="mt-1 text-ui-subtle">Accepting applications</p>
            </Surface>
          </GridItem>
        </Grid>
      </Example>
      <Example title="Collapsible">
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>
            Additional settings
          </Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <Text>
              Choose how applicants receive updates about their submissions.
            </Text>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
      </Example>
      <Example title="Empty">
        <Empty
          icon={<FileTextIcon size={40} />}
          title="No submissions yet"
          description="New submissions will appear here when applicants complete your form."
          contents={<Button icon={PlusIcon}>Share form</Button>}
        />
      </Example>
    </div>
  );
}
function DataExamples() {
  return (
    <div className="space-y-7">
      <Example title="Table">
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Form</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Submissions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              <Table.Row>
                <Table.Cell>Transport application</Table.Cell>
                <Table.Cell>
                  <Badge variant="primary">Published</Badge>
                </Table.Cell>
                <Table.Cell>24</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>School registration</Table.Cell>
                <Table.Cell>
                  <Badge>Draft</Badge>
                </Table.Cell>
                <Table.Cell>0</Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table>
        </div>
      </Example>
      <Example title="Text">
        <div className="flex flex-wrap items-baseline gap-5">
          <Text as="h4" variant="heading" size="lg">
            Heading
          </Text>
          <Text>Body text</Text>
          <Text variant="secondary">Secondary text</Text>
          <Text variant="mono">Monospace</Text>
          <Text variant="success">Success</Text>
          <Text variant="error">Error</Text>
        </div>
      </Example>
      <Example title="Code">
        <CodeBlock
          code={'const form = { title: "Transport application" };'}
          lang="ts"
        />
      </Example>
      <Example title="CodeHighlighted">
        <ShikiProvider engine="javascript" languages={["tsx"]}>
          <CodeHighlighted
            code={'<Input label="Form title" placeholder="Enter a title" />'}
            lang="tsx"
          />
        </ShikiProvider>
      </Example>
      <Example title="Flow">
        <div className="overflow-x-auto p-2">
          <Flow>
            <Flow.Node>Draft</Flow.Node>
            <Flow.Node>Review</Flow.Node>
            <Flow.Node>Published</Flow.Node>
          </Flow>
        </div>
      </Example>
    </div>
  );
}
export function Catalogue() {
  return (
    <TooltipProvider>
      <div className="min-w-0 space-y-10">
        <Section title="Form pattern">
          <FormPattern />
        </Section>
        <Section title="Colors">
          <ColorExamples />
        </Section>
        <Section title="Buttons">
          <ButtonExamples />
        </Section>
        <Section title="Text fields">
          <TextFieldExamples />
        </Section>
        <Section title="Choices">
          <ChoiceExamples />
        </Section>
        <Section title="Selection">
          <SelectionExamples />
        </Section>
        <Section title="Dates">
          <DateExamples />
        </Section>
        <Section title="Overlays">
          <OverlayExamples />
        </Section>
        <Section title="Feedback">
          <FeedbackExamples />
        </Section>
        <Section title="Navigation">
          <NavigationExamples />
        </Section>
        <Section title="Surfaces">
          <div className="space-y-8">
            <ElevationExamples />
            <SurfaceExamples />
          </div>
        </Section>
        <Section title="Scrollbars">
          <ScrollbarExamples />
        </Section>
        <Section title="Data and content">
          <DataExamples />
        </Section>
      </div>
    </TooltipProvider>
  );
}
