import { Combobox } from "@base-ui/react/combobox";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { isSameDay } from "date-fns";
import {
  BookmarkSimple,
  CaretDown,
  CaretRight,
  Check,
  DotsThreeVertical,
  File,
  type Icon,
  MagnifyingGlass,
  Sigma,
  Smiley,
  TextT,
  Tray,
  User,
  X,
} from "@phosphor-icons/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../cn";
import { Button } from "../../ui/button";
import { Calendar } from "../../ui/calendar";
import { formatDay, parseDay, shortDate } from "../core/dates";
import { ItemLabel, item } from "../../ui/item";
import { PillInput, pill, pillChevron, pillIcon } from "../../ui/pill";
import { check, list, option, popup } from "../../ui/select";
import { Tip } from "../../ui/tooltip";
import type { LogicValue } from "../core/logic";
import { kindIcon } from "./logic-icons";
import { type Field, type TreeNode } from "../features/logic/queries";
import { useSettled, useOutside, useEscape } from "./logic-hooks";

export const metadataIcons = {
  id: <Tray />,
  respondentId: <User />,
  formName: <TextT />,
};

export const fieldIcon = (f: Field) =>
  f.type === "CALCULATED_FIELD" ? (
    <Sigma />
  ) : f.type === "METADATA" ? (
    "id" === f.kind || "respondentId" === f.kind || "formName" === f.kind ? (
      metadataIcons[f.kind]
    ) : undefined
  ) : (
    kindIcon(f.kind)
  );

export type FieldGroup = { label: string; items: Field[] };

export const typeGroups = (fields: Field[]): FieldGroup[] =>
  (
    [
      ["METADATA", "Metadata fields"],
      ["INPUT_FIELD", "Input fields"],
      ["CALCULATED_FIELD", "Calculated fields"],
    ] as const
  ).flatMap(([type, label]) => {
    const items = fields.filter((f) => f.type === type);

    return items.length ? [{ label, items }] : [];
  });

/** Group by page when references span multiple pages; otherwise group by field type. */
export function pickerGroups(fields: Field[]): FieldGroup[] {
  const pages: FieldGroup[] = [];

  for (const f of fields) {
    const last = pages.at(-1);

    if (last && last.label === f.page) last.items.push(f);
    else pages.push({ label: f.page ?? "", items: [f] });
  }

  return pages.length > 1 ? pages : typeGroups(fields);
}

// ---- Layout ----

// Logic and calculated fields are the author's alone: they sit on the desk's grey, not on the form's white sheet
export const surface = "rounded-sm bg-grey-10 p-3 shadow-[inset_0_0_0_1px_var(--color-line)]";

/** What an author-only block is, over it. */
export function Caption({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <div className="flex h-6 items-center gap-1.5 text-12 font-semibold text-muted select-none [&>svg]:size-3.5 [&>svg]:text-blue-40">
      {icon}
      {children} · not shown on the form
    </div>
  );
}

export const row = "relative flex w-max items-center gap-1 *:shrink-0 [&_button:focus]:outline-3";

export const header =
  "flex items-center gap-1 text-14 leading-5 font-semibold text-muted [&_button:focus]:outline-3";

/** Use the nearest vertically scrolling ancestor, falling back to the page. */
export function scroller(el: HTMLElement) {
  for (let parent = el.parentElement; parent; parent = parent.parentElement)
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;

  return document.documentElement;
}

/**
 * Extend horizontal scrolling to the surrounding container, with fades where more content is available.
 * `root` also anchors the formula editor and visibility tree portals.
 */
export function Scroll({ root, children }: { root?: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [bleed, setBleed] = useState({ left: 0, right: 0 });
  const [fade, setFade] = useState({ left: false, right: false });

  const measureFade = useCallback(() => {
    const el = area.current;

    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }));
  }, []);

  useLayoutEffect(() => {
    let frame = 0;

    const measure = () => {
      const el = box.current;

      if (!el) return;
      const outer = scroller(el);
      const start = outer.getBoundingClientRect().left + outer.clientLeft;
      const { left: from, right: to } = el.getBoundingClientRect();
      const left = Math.round(Math.max(0, from - start));
      const right = Math.round(Math.max(0, start + outer.clientWidth - to));
      setBleed((b) => (b.left === left && b.right === right ? b : { left, right }));
      measureFade();
    };

    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    addEventListener("resize", onResize);

    return () => {
      removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [measureFade]);
  // The content changed: whether a side has more to scroll to may have too
  useLayoutEffect(measureFade);

  const mask =
    fade.left || fade.right
      ? `linear-gradient(to right, ${fade.left ? "transparent 0, #000 40px" : "#000 0"}, ${fade.right ? "#000 calc(100% - 40px), transparent 100%" : "#000 100%"})`
      : undefined;

  return (
    <div ref={box} dir="ltr" data-logic-editor-root={root ? "" : undefined} className="relative">
      <div
        ref={area}
        onScroll={measureFade}
        className="-my-1 overflow-x-auto py-1"
        style={{
          marginLeft: -bleed.left,
          marginRight: -bleed.right,
          paddingLeft: bleed.left,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      >
        <div className="relative w-max py-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Where a ContextMenu opens, in its container's coordinates: under `top` or over `bottom`, from `left` or back from `right`. */
export type Spot = { top: number; bottom: number; left: number; right: number };

export const atPointer = (e: { clientX: number; clientY: number }): Spot => ({
  top: e.clientY,
  bottom: innerHeight - e.clientY,
  left: e.clientX,
  right: innerWidth - e.clientX,
});

export type Placement = { up: boolean; back: boolean; max?: number };

// Refit growing menus within the available space above or below their anchor.
export function fit(p: Placement, height: number, top: number): Placement {
  const below = innerHeight - top;
  const above = top - 46;

  if (height <= below && height <= above) return p;

  const up =
    height > below && height <= above
      ? true
      : height > above && height <= below
        ? false
        : above > below;

  const room = Math.floor(up ? above : below);

  return { ...p, up, max: room > 0 && height > room ? room : p.max };
}

/**
 * Keep the pointer-anchored menu inside the viewport. `into` positions it within a containing element;
 * `grows` remeasures menus whose content changes height.
 */
export function ContextMenu({
  at,
  into,
  width = "220px",
  grows,
  onClose,
  children,
}: {
  at: Spot;
  into?: Element;
  width?: string;
  grows?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    const { top, bottom, right, height } = el.getBoundingClientRect();
    const above = top - height;
    const below = innerHeight - bottom;
    let next: Placement = { up: false, back: right > innerWidth };

    if (above < 0 && below < 0)
      next = { ...next, up: above > below, max: above > below ? top - 156 : height + below - 120 };
    else if (below < 0) next = { ...next, up: true, max: above > 156 ? undefined : top - 156 };
    setPlace(grows ? fit(next, height, top) : next);

    if (!grows) return;

    const observer = new ResizeObserver(() => {
      const measuredHeight = el.getBoundingClientRect().height;
      setPlace((previous) => previous && fit(previous, measuredHeight, top));
    });

    observer.observe(el);

    return () => observer.disconnect();
  }, [grows]);
  useOutside(box, onClose);
  useEscape(onClose);

  const style: CSSProperties = {
    width,
    maxHeight: place?.max,
    ...(place?.up ? { bottom: at.bottom } : { top: at.top }),
    ...(place?.back ? { right: at.right } : { left: at.left }),
  };

  return createPortal(
    <>
      <div className="form-context-menu-overlay fixed inset-0 z-1000000005" />
      <div
        ref={box}
        aria-hidden={!place}
        onClick={(e) => e.stopPropagation()}
        style={style}
        className={cn(
          "form-context-menu z-1000000005 max-w-175 overflow-hidden rounded-sm bg-white font-sans shadow-popup max-md:max-w-[min(700px,calc(100vw-50px))] max-sm:max-w-[min(700px,calc(50vw-10px))]",
          into ? "absolute" : "fixed",
          !place && "opacity-0",
        )}
      >
        <div className="overflow-x-hidden overflow-y-auto" style={{ maxHeight: place?.max }}>
          {children}
        </div>
      </div>
    </>,
    into ?? document.body,
  );
}

export type MenuItem = [label: string, icon: Icon, run: () => void];

export function More({
  label,
  items,
  size,
}: {
  label: string;
  items: (MenuItem | false)[];
  size?: "sm";
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button size={size} icon={<DotsThreeVertical />} aria-label={label} />}
      />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className="max-h-(--available-height) w-55 max-w-[calc(100vw-24px)] overflow-y-auto rounded-sm bg-white py-1.5 font-sans shadow-popup">
            {items.map((entry) => {
              if (!entry) return null;
              const [text, Icon, run] = entry;

              return (
                <Menu.Item key={text} onClick={run} className={item}>
                  <ItemLabel icon={<Icon />}>{text}</ItemLabel>
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export const listIcon = "[&>svg]:size-3.5";

export const divider = <span className="ml-1 h-4 w-px shrink-0 bg-grey-30" />;

export const pillValue = "pointer-events-none min-w-0 truncate leading-normal select-none";

export const pillButton = cn(
  pillChevron,
  "relative ml-0.5 cursor-pointer outline-none after:absolute after:-inset-y-2 after:-right-2 after:-left-1.75 focus-visible:rounded-xs focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
);

export const popupLayer = "z-50 outline-none";

export const searchBar =
  "flex min-h-9 w-full shrink-0 items-center gap-2 border-b border-line bg-white pr-2.5 pl-3.5 [&>svg:first-child]:size-4 [&>svg:first-child]:shrink-0 [&>svg:first-child]:text-subtle";

export const searchInput =
  "min-w-0 flex-1 bg-transparent p-0 text-14 leading-5 text-ink outline-none placeholder:text-placeholder max-[480px]:text-16";

// Clicking the surrounding control should focus its input too.
export function focusPillInput(e: MouseEvent<HTMLElement>) {
  const input = e.currentTarget.querySelector("input");

  if (
    !input ||
    e.target === input ||
    (e.target instanceof Element && e.target.closest("button")) ||
    e.defaultPrevented
  )
    return;
  e.preventDefault();
  input.focus();
}

export const focusInput = (el: HTMLElement | null) =>
  el?.querySelector("input")?.focus({ preventScroll: true });

export type PickItem<T extends string = string> = { value: T; label: string; icon?: ReactNode };

/** Icon-only triggers retain the selected option's name as a tooltip. */
export function Pick<T extends string>({
  items,
  value,
  onChange,
  placeholder,
  label,
  iconOnly,
  footer,
}: {
  items: PickItem<T>[];
  value?: string;
  onChange: (value: T) => void;
  placeholder: string;
  label?: string;
  iconOnly?: boolean;
  footer?: ReactNode;
}) {
  const current = items.find((i) => i.value === value);

  const trigger = (
    <Select.Trigger
      data-logic-pill=""
      aria-label={current && iconOnly ? current.label : (label ?? placeholder)}
      className={cn(pill, "cursor-pointer")}
    >
      {current?.icon && !iconOnly && <span className={pillIcon}>{current.icon}</span>}
      <Select.Value className={cn(pillValue, "[&>svg]:size-4 [&>svg]:align-middle")}>
        {() => (current ? (iconOnly ? current.icon : current.label) : placeholder)}
      </Select.Value>
      <Select.Icon className={pillChevron}>
        <CaretDown />
      </Select.Icon>
    </Select.Trigger>
  );

  return (
    <Select.Root
      value={value ?? null}
      onValueChange={(v) => {
        const selected = items.find((item) => item.value === v);

        if (selected && selected.value !== value) onChange(selected.value);
      }}
    >
      {iconOnly && current ? <Tip content={current.label}>{trigger}</Tip> : trigger}
      <Select.Portal>
        <Select.Positioner
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          className={popupLayer}
        >
          <Select.Popup className={popup}>
            <Select.List className={list}>
              {items.map((i) => (
                <Select.Item key={i.value} value={i.value} className={cn(option, listIcon)}>
                  {i.icon}
                  <Select.ItemText className="min-w-0 flex-1 truncate">{i.label}</Select.ItemText>
                  <Select.ItemIndicator className={check}>
                    <Check />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
            {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** Preserve blank option labels so authors can identify incomplete options. */
export function OptionsPick({
  options,
  value,
  multiple,
  onChange,
}: {
  options: [string, string][];
  value: LogicValue | undefined;
  multiple: boolean;
  onChange: (v: LogicValue) => void;
}) {
  const picked = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string" && value
      ? [value]
      : [];

  const one = options.find(([v]) => v === picked[0]);

  const text = multiple
    ? options
        .filter(([v]) => picked.includes(v))
        .map(([, l]) => l)
        .join(", ") || undefined
    : one?.[1];

  return (
    <Select.Root<string, boolean>
      multiple={multiple}
      value={multiple ? picked : (picked[0] ?? null)}
      onValueChange={(v) =>
        onChange(
          multiple ? (Array.isArray(v) ? v : []) : Array.isArray(v) ? (v[0] ?? "") : (v ?? ""),
        )
      }
    >
      <Select.Trigger
        aria-label="Select option"
        data-placeholder={(multiple ? text : one) ? undefined : ""}
        className={cn(pill, "cursor-pointer")}
      >
        <span className={pillValue}>{text ?? "Select option"}</span>
        <Select.Icon className={pillChevron}>
          <CaretDown />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          className={popupLayer}
        >
          <Select.Popup className={popup}>
            <Select.List className={list}>
              {options.map(([v, l]) => (
                <Select.Item key={v} value={v} className={option}>
                  <Select.ItemText className="min-w-0 flex-1 truncate">{l}</Select.ItemText>
                  <Select.ItemIndicator className={check}>
                    <Check />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** With `typed`, accept either a literal value or a reference to a field. */
export function FieldCombobox({
  groups,
  value,
  typed,
  placeholder,
  label,
  emptyText = "No fields match",
  onSelect,
  onType,
  onClear,
  footer,
}: {
  groups: FieldGroup[];
  /** The picked field's key. */
  value?: string;
  /** What's typed in, for a pill that takes values. */
  typed?: string;
  placeholder: string;
  label?: string;
  emptyText?: string;
  onSelect: (field: Field) => void;
  onType?: (text: string) => void;
  onClear?: () => void;
  footer?: ReactNode;
}) {
  const { contains } = Combobox.useFilter({ sensitivity: "base" });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const all = groups.flatMap((g) => g.items);
  const selected = all.find((f) => f.key === value) ?? null;

  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((f) => contains(f.title, query)) }))
    .filter((g) => g.items.length);

  const searching = shown.reduce((n, g) => n + g.items.length, 0) >= 10 || !!query;
  const text = selected?.title ?? typed ?? (value ? "Missing field" : "");

  return (
    <Combobox.Root
      items={shown}
      filter={null}
      value={selected}
      inputValue={query}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(f) => {
        if (f) onSelect(f);
        else onClear?.();
        setQuery("");
      }}
      onInputValueChange={(v, details) =>
        (details.reason === "input-change" || details.reason === "input-clear") && setQuery(v)
      }
      itemToStringLabel={(f) => f.title}
      isItemEqualToValue={(a, b) => a.key === b.key}
      autoHighlight
    >
      {typed === undefined ? (
        <Combobox.Trigger
          data-logic-pill=""
          aria-label={label ?? placeholder}
          data-placeholder={text ? undefined : ""}
          className={cn(pill, "cursor-pointer")}
        >
          {selected && <span className={pillIcon}>{fieldIcon(selected)}</span>}
          <span className={pillValue}>{text || placeholder}</span>
          <span className={pillChevron}>
            <CaretDown />
          </span>
        </Combobox.Trigger>
      ) : (
        <span
          data-logic-pill=""
          ref={setAnchor}
          data-placeholder={text ? undefined : ""}
          onMouseDown={focusPillInput}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (
              open ||
              !all.length ||
              !(e.target instanceof HTMLInputElement) ||
              (e.key !== "ArrowDown" && e.key !== "ArrowUp")
            )
              return;
            e.preventDefault();
            setOpen(true);
          }}
          className={pill}
        >
          {selected ? (
            <Combobox.Trigger
              aria-label={label ?? placeholder}
              className="inline-flex min-w-0 cursor-pointer items-center gap-1 outline-none"
            >
              <span className={pillIcon}>{fieldIcon(selected)}</span>
              <span className={pillValue}>{text}</span>
            </Combobox.Trigger>
          ) : (
            <PillInput
              placeholder={placeholder}
              label={label}
              value={draft ?? text}
              onChange={(next) => {
                setDraft(next);
                onType?.(next);
              }}
            />
          )}
          {selected && onClear ? (
            <>
              {divider}
              <Combobox.Clear aria-label="Clear" className={pillButton}>
                <X />
              </Combobox.Clear>
            </>
          ) : (
            all.length > 0 && (
              <>
                {divider}
                <Combobox.Trigger
                  aria-label={`${label ?? placeholder} options`}
                  className={pillButton}
                >
                  <CaretDown />
                </Combobox.Trigger>
              </>
            )
          )}
        </span>
      )}
      <Combobox.Portal>
        <Combobox.Positioner
          anchor={typed === undefined ? undefined : anchor}
          align="start"
          sideOffset={6}
          className={popupLayer}
        >
          <Combobox.Popup
            className={popup}
            finalFocus={() => (typed !== undefined && anchor?.querySelector("input")) || true}
          >
            {searching && (
              <div className={searchBar}>
                <MagnifyingGlass />
                <Combobox.Input ref={search} placeholder="Search" className={searchInput} />
                {query && (
                  <Button
                    size="sm"
                    tabIndex={-1}
                    aria-label="Clear"
                    icon={<X />}
                    onClick={() => {
                      setQuery("");
                      search.current?.focus();
                    }}
                  />
                )}
              </div>
            )}
            <Combobox.Empty className="px-3.75 py-2.5 text-14 text-subtle empty:hidden">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className={cn(list, "gap-1.25 data-empty:p-0")}>
              {(group: FieldGroup) => (
                <Combobox.Group key={group.label} items={group.items}>
                  {shown.length > 1 && (
                    <Combobox.GroupLabel className="px-2.5 py-1.25 text-12 font-semibold text-subtle">
                      {group.label}
                    </Combobox.GroupLabel>
                  )}
                  <Combobox.Collection>
                    {(f: Field) => (
                      <Combobox.Item key={f.key} value={f} className={cn(option, listIcon)}>
                        {fieldIcon(f)}
                        <span className="min-w-0 flex-1 truncate">{f.title}</span>
                        <Combobox.ItemIndicator className={check}>
                          <Check />
                        </Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
            {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export const isRef = (v: unknown): v is { field: string } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Preserve raw number text while typing; accept a decimal comma when committing on blur. */
export function ValuePick({
  groups,
  value,
  number,
  placeholder,
  emptyText,
  onChange,
}: {
  groups: FieldGroup[];
  value: LogicValue | undefined;
  number: boolean;
  placeholder: string;
  emptyText?: string;
  onChange: (v: LogicValue | undefined) => void;
}) {
  return (
    <FieldCombobox
      groups={groups}
      value={isRef(value) ? value.field : undefined}
      typed={isRef(value) ? "" : String(value ?? "")}
      placeholder={placeholder}
      emptyText={emptyText}
      onSelect={(f) => onChange({ field: f.key })}
      onType={(text) => onChange(number && text !== "" ? parseFloat(text.replace(",", ".")) : text)}
      onClear={() => onChange(undefined)}
    />
  );
}

export function PillPopover({
  text,
  placeholder,
  children,
}: {
  text?: string;
  placeholder: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={placeholder}
        data-placeholder={text ? undefined : ""}
        className={cn(pill, "cursor-pointer")}
      >
        <span className={pillValue}>{text || placeholder}</span>
        <span className={pillChevron}>
          <CaretDown />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} className={popupLayer}>
          <Popover.Popup aria-label={placeholder} className={cn(popup, "overflow-hidden")}>
            {children(() => setOpen(false))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const pad = (n: number) => String(n).padStart(2, "0");

export const timeSelect =
  "h-8 cursor-pointer appearance-none rounded-sm bg-white px-2 text-14 text-ink shadow-input outline-none hover:shadow-input-hover focus-visible:shadow-input-focus";

/** Selecting the current date again clears it. */
export function DatePick({
  value,
  onChange,
}: {
  value: LogicValue | undefined;
  onChange: (v: string) => void;
}) {
  const day = parseDay(value);

  return (
    <PillPopover text={day && shortDate(day)} placeholder="Date">
      {(close) => (
        <div className="py-2">
          <Calendar
            mode="single"
            selected={day}
            month={day}
            weekStartsOn={1}
            onDayClick={(picked) => {
              if (day && isSameDay(day, picked)) return onChange("");
              onChange(formatDay(picked));
              close();
            }}
          />
        </div>
      )}
    </PillPopover>
  );
}

export function TimePick({
  value,
  onChange,
}: {
  value: LogicValue | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const [h = "", m = ""] = typeof value === "string" ? value.split(":") : [];
  const [hour, setHour] = useState(h);
  const [minutes, setMinutes] = useState(m);

  const pick = (nextHour: string, nextMinutes: string, close: () => void) => {
    setHour(nextHour);
    setMinutes(nextMinutes);
    onChange(nextHour && nextMinutes ? `${nextHour}:${nextMinutes}` : undefined);

    if (nextHour && nextMinutes) close();
  };

  return (
    <PillPopover text={h && m ? `${h}:${m}` : undefined} placeholder="Time">
      {(close) => (
        <div className="flex items-center gap-1.5 p-2">
          <select
            aria-label="Hour"
            value={hour}
            onChange={(e) => pick(e.target.value, minutes, close)}
            className={timeSelect}
          >
            <option value="">Hour</option>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i}>{pad(i)}</option>
            ))}
          </select>
          <span className="font-semibold text-muted">:</span>
          <select
            aria-label="Minutes"
            value={minutes}
            onChange={(e) => pick(hour, e.target.value, close)}
            className={timeSelect}
          >
            <option value="">Minutes</option>
            {Array.from({ length: 60 }, (_, i) => (
              <option key={i}>{pad(i)}</option>
            ))}
          </select>
        </div>
      )}
    </PillPopover>
  );
}

export type Ticked = "checked" | "indeterminate" | "unchecked";

export type TreeRow = {
  node: TreeNode;
  depth: number;
  expandable: boolean;
  selectable: boolean;
  state: Ticked | null;
  open: boolean;
};

export const treeIcon = (icon?: string) =>
  icon === "form-title" ? (
    <BookmarkSimple />
  ) : icon === "confirmation" ? (
    <Smiley />
  ) : icon === "page-break" ? (
    <File />
  ) : icon === "numbered-list" ? (
    kindIcon("number", true)
  ) : icon ? (
    kindIcon(icon)
  ) : null;

export const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Show/Hide's picker. Rows: pages (once there are two), their questions and blocks, and a question's own blocks.
 * Picking a page or question picks all its blocks, and what's kept is the fewest pages, questions and blocks that
 * cover the pick. It opens with every page expanded when there are three or fewer, else the logic block's page and
 * the next, plus whatever's partly picked. The search waits 150ms, ignores accents and needs every word.
 */
export function BlocksPick({
  tree,
  value,
  page,
  onChange,
}: {
  tree: TreeNode[];
  value: string[];
  page: number;
  onChange: (ids: string[]) => void;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const rowsBox = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ root: Element; at: Spot } | null>(null);
  const [query, setQuery] = useState("");
  const settled = useSettled(query, 150);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Reset manually expanded search results when the query changes.
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const starting = useRef(false);

  const byKey = useMemo(() => new Map(tree.map((n) => [n.key, n])), [tree]);
  const byId = useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree]);

  const chosen = useMemo(
    () => new Set(value.flatMap((id) => byId.get(id)?.blocks ?? [])),
    [value, byId],
  );

  const stateOf = useCallback(
    (n: TreeNode): Ticked => {
      const count = n.blocks.filter((b) => chosen.has(b)).length;

      return !count ? "unchecked" : count === n.blocks.length ? "checked" : "indeterminate";
    },
    [chosen],
  );

  const pick = (n: TreeNode) => {
    if (n.index === 0) return;
    const next = new Set(chosen);
    const all = n.blocks.every((b) => next.has(b));

    for (const b of n.blocks) {
      if (all) next.delete(b);
      else next.add(b);
    }

    const covered = new Set<string>();
    const ids: string[] = [];

    for (const m of tree) {
      if (
        m.index === 0 ||
        !m.blocks.length ||
        m.blocks.every((b) => covered.has(b)) ||
        !m.blocks.every((b) => next.has(b))
      )
        continue;
      ids.push(m.id);
      m.blocks.forEach((b) => covered.add(b));
    }

    onChange(ids);
  };

  const matching = useMemo(() => {
    const words = plain(settled).split(/\s+/).filter(Boolean);

    if (!words.length) return null;

    return new Set(
      tree
        .filter((n) => n.label && words.every((w) => plain(n.label).includes(w)))
        .map((n) => n.key),
    );
  }, [settled, tree]);

  // A match opens its page, and its question unless the question matched under the same name
  const searchOpen = useMemo(() => {
    if (!matching) return null;
    const out = new Set<string>();

    for (const key of matching) {
      const n = byKey.get(key)!;

      if (n.kind === "page") continue;
      const q = n.question ? byKey.get(n.question) : undefined;

      if (q && q.blocks.length > 1 && !(n.label === q.label && matching.has(q.key))) out.add(q.key);
      out.add(n.page);
    }

    return out;
  }, [matching, byKey]);

  const [lastSearch, setLastSearch] = useState(searchOpen);

  if (lastSearch !== searchOpen) {
    setLastSearch(searchOpen);

    if (toggled.size) setToggled(new Map());
  }

  const { effective, manual } = useMemo(() => {
    const effective = new Set(searchOpen ?? expanded);
    const manual = new Set(searchOpen ? [] : expanded);

    for (const [key, isOpen] of toggled) {
      if (isOpen) {
        effective.add(key);
        manual.add(key);
      } else effective.delete(key);
    }

    for (const key of effective)
      if (byKey.get(key)?.kind === "question" && byKey.get(key)!.blocks.length === 1)
        effective.delete(key);

    return { effective, manual };
  }, [searchOpen, expanded, toggled, byKey]);

  const toggleOpen = (key: string) => {
    if (searchOpen) setToggled((t) => new Map(t).set(key, !(t.get(key) ?? searchOpen.has(key))));
    else
      setExpanded((e) => {
        const next = new Set(e);

        if (next.has(key)) next.delete(key);
        else next.add(key);

        return next;
      });
  };

  const rows = useMemo(() => {
    const shown = matching && new Set([...matching, ...(searchOpen ?? [])]);

    const visible = (n: TreeNode) =>
      !matching ||
      !!shown?.has(n.key) ||
      (!!n.question && matching.has(n.question) && manual.has(n.question)) ||
      (matching.has(n.page) && manual.has(n.page));

    const pages = tree.filter((n) => n.kind === "page").length;
    const out: TreeRow[] = [];
    let pageOpen = false;

    for (const n of tree) {
      if (!visible(n)) continue;
      const isOpen = effective.has(n.key);

      if (n.kind === "page") {
        pageOpen = isOpen;

        if (pages > 1)
          out.push({
            node: n,
            depth: 0,
            expandable: true,
            selectable: n.index! > 0,
            state: n.index! > 0 ? stateOf(n) : null,
            open: isOpen,
          });
        continue;
      }

      if (!pageOpen) continue;
      const depth = pages > 1 ? 1 : 0;

      if (n.kind === "question")
        out.push({
          node: n,
          depth,
          expandable: n.blocks.length > 1,
          selectable: true,
          state: stateOf(n),
          open: n.blocks.length > 1 && isOpen,
        });
      else if (!n.question || effective.has(n.question))
        out.push({
          node: n,
          depth: n.question ? depth + 1 : depth,
          expandable: false,
          selectable: true,
          state: stateOf(n),
          open: false,
        });
    }

    return out;
  }, [tree, matching, searchOpen, manual, effective, stateOf]);

  // Opening sets what's expanded, once the open render is in
  useEffect(() => {
    if (!starting.current) return;
    starting.current = false;
    const pages = tree.filter((n) => n.kind === "page");

    const next = new Set(
      (pages.length <= 3 ? pages : [pages[page], pages[page + 1]]).flatMap((p) =>
        p ? [p.key] : [],
      ),
    );

    for (const n of tree) if (stateOf(n) === "indeterminate") next.add(n.key);
    setExpanded(next);
    setToggled(new Map());
  });
  useLayoutEffect(() => {
    const el = trigger.current;
    const root = el?.closest("[data-logic-editor-root]");

    if (!open || !el || !root) return;
    const a = el.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    setSpot({
      root,
      at: {
        top: a.bottom - r.top + 4,
        bottom: r.bottom - a.top + 4,
        left: a.left - r.left,
        right: r.right - a.left,
      },
    });
  }, [open]);

  const show = () => {
    setQuery("");
    setOpen(true);
    starting.current = true;
  };

  const hide = () => {
    setOpen(false);
    setSpot(null);
    setQuery("");
    trigger.current?.focus();
  };

  const focusSearch = useCallback((el: HTMLInputElement | null) => {
    search.current = el;
    el?.focus({ preventScroll: true });
  }, []);

  const focusRow = (key: string) => {
    const el = rowsBox.current?.querySelector<HTMLElement>(`[data-uuid="${key}"]`);
    const options = { preventScroll: true, focusVisible: true };
    el?.focus(options);
    el?.scrollIntoView({ block: "nearest" });
  };

  const onTreeKey = (e: KeyboardEvent) => {
    if (!rows.length) return;
    const current = document.activeElement?.getAttribute("data-uuid");
    const i = current ? rows.findIndex((r) => r.node.key === current) : -1;
    const at = rows[i];

    const go = (j: number) => {
      const r = rows[j];

      if (r) focusRow(r.node.key);
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();

        if (i <= 0) search.current?.focus();
        else go(i - 1);
        break;
      case "ArrowRight":
        e.preventDefault();

        if (!at?.expandable) return;

        if (at.open) go(i + 1);
        else toggleOpen(at.node.key);
        break;
      case "ArrowLeft": {
        e.preventDefault();

        if (!at) return;

        if (at.expandable && at.open) return toggleOpen(at.node.key);
        const parent = rows.slice(0, i).findLastIndex((r) => r.depth < at.depth);

        if (parent >= 0) go(parent);
        break;
      }

      case "Enter":
        e.preventDefault();

        if (at?.expandable) toggleOpen(at.node.key);
        else if (at?.selectable) pick(at.node);
        break;
      case " ":
        e.preventDefault();

        if (at?.selectable) pick(at.node);
    }
  };

  const picked = value.map((id) => byId.get(id) ?? { key: id, label: "", icon: undefined });

  return (
    <span className="relative inline-flex min-w-0">
      <span
        ref={trigger}
        role="button"
        aria-haspopup="tree"
        aria-expanded={open}
        data-popup-open={open || undefined}
        data-placeholder={picked.length ? undefined : ""}
        tabIndex={0}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown") return;
          e.preventDefault();
          show();
        }}
        className={cn(pill, "max-w-160 cursor-pointer")}
      >
        <span className={pillValue}>
          {picked.length
            ? picked.map((n, i) => (
                <Fragment key={n.key}>
                  {i > 0 && ", "}
                  {n.icon && <span className={pillIcon}>{treeIcon(n.icon)}</span>} {n.label}
                </Fragment>
              ))
            : "Select blocks"}
        </span>
        <span className={pillChevron}>
          <CaretDown />
        </span>
      </span>
      {open && spot && (
        <ContextMenu at={spot.at} into={spot.root} width="320px" grows onClose={hide}>
          <div className={cn(searchBar, "sticky top-0 z-1")}>
            <MagnifyingGlass />
            <input
              ref={focusSearch}
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown" || !rows.length) return;
                e.preventDefault();
                focusRow(rows[0]!.node.key);
              }}
              className={searchInput}
            />
            {query && (
              <Button
                size="sm"
                tabIndex={-1}
                aria-label="Clear"
                icon={<X />}
                onClick={() => {
                  setQuery("");
                  search.current?.focus();
                }}
              />
            )}
          </div>
          <div
            ref={rowsBox}
            role="tree"
            data-empty={rows.length ? undefined : ""}
            onKeyDown={onTreeKey}
            className="w-full py-1.5 outline-none data-empty:p-0"
          >
            {rows.length ? (
              rows.map((r, i) => (
                <TreeRowView
                  key={r.node.key}
                  row={r}
                  next={rows[i + 1]?.depth ?? -1}
                  onPick={() => pick(r.node)}
                  onToggle={() => toggleOpen(r.node.key)}
                />
              ))
            ) : (
              <div className="px-3.75 py-2.5 text-14 text-muted">No results</div>
            )}
          </div>
        </ContextMenu>
      )}
    </span>
  );
}

export const ariaChecked = { checked: "true", indeterminate: "mixed", unchecked: "false" } as const;

/** One row: guide lines down to it, the chevron that expands it, its icon and name, and its checkbox. */
export function TreeRowView({
  row: r,
  next,
  onPick,
  onToggle,
}: {
  row: TreeRow;
  next: number;
  onPick: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        data-uuid={r.node.key}
        data-depth={r.depth}
        role="treeitem"
        aria-level={r.depth + 1}
        aria-expanded={r.expandable ? r.open : undefined}
        aria-checked={r.state ? ariaChecked[r.state] : undefined}
        tabIndex={0}
        onClick={() => (r.selectable ? onPick() : r.expandable && onToggle())}
        style={{ paddingLeft: 8 + 20 * r.depth }}
        className="relative mx-1 flex min-h-8 w-[calc(100%-8px)] cursor-pointer items-center gap-2 rounded-sm pr-2.5 select-none hover:bg-hover focus-visible:bg-blue-80 focus-visible:text-white focus-visible:outline-none *:cursor-pointer focus-visible:[&_svg]:text-white"
      >
        {Array.from({ length: r.depth }, (_, d) => (
          <span
            key={d}
            className="pointer-events-none absolute top-0 w-0.5 bg-line"
            style={{ left: 17 + 20 * d, bottom: next <= d ? "50%" : 0 }}
          />
        ))}
        {r.expandable ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[calc(var(--indent)+28px)] hover:bg-hover hover:text-ink focus-visible:outline-none [&>svg]:size-3.5 [&>svg]:transition-transform [&>svg]:duration-150",
              r.open && "[&>svg]:rotate-90",
            )}
          >
            <CaretRight />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <span
          title={r.node.label}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-14 leading-4 [&>span]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted"
        >
          {r.node.kind !== "page" && treeIcon(r.node.icon)}
          <span>{r.node.label}</span>
        </span>
        {r.selectable && r.state && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onPick();
            }}
            className="ml-auto flex shrink-0 items-center"
          >
            <span
              data-state={r.state}
              className="grid size-4 place-items-center rounded-xs bg-white text-white shadow-input data-[state=checked]:bg-interactive data-[state=checked]:shadow-none data-[state=indeterminate]:bg-interactive [&>svg]:size-3"
            >
              {r.state === "checked" ? (
                <Check />
              ) : r.state === "indeterminate" ? (
                <span className="h-0.5 w-2 rounded-full bg-white" />
              ) : null}
            </span>
          </span>
        )}
      </div>
      {r.depth > 0 && next === 0 && <div className="h-1 w-full shrink-0" />}
    </>
  );
}
