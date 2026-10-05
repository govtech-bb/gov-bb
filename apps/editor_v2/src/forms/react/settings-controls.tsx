import { Menu } from "@base-ui/react/menu";
import { CaretDown, Check } from "@phosphor-icons/react";
import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "../../cn";
import { ItemLabel, Shortcut, item } from "../../ui/item";
import { compactInput } from "../../ui/input";
import { check, list, option, popup } from "../../ui/select";
import type { Setting, Settings } from "../core/settings";
import { boundsError, DEFAULT_FIELD_ARRAY, withText, type FieldArray } from "../core/repetition";
import { isFieldless } from "../editor/ssb";
import type { BlockErrorMessage } from "./block-settings";

export type Patch = Partial<Record<string, Setting | undefined>>;

type Options = [value: string, label: string][];

export const settingsGroupClassName =
  "not-last:mb-1.5 not-last:border-b not-last:border-line not-last:pb-1.5";

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <Menu.Group className={settingsGroupClassName}>{children}</Menu.Group>;
}

// The settings a row reads and writes: the question's, or (for an option's own rows) the option's
type StoreValue = { settings: Settings; set: (patch: Patch) => void };

const StoreContext = createContext<StoreValue>({ settings: {}, set: () => {} });

export function Store({ settings, set, children }: StoreValue & { children: ReactNode }) {
  return <StoreContext value={{ settings, set }}>{children}</StoreContext>;
}

export const useStore = () => useContext(StoreContext);

const parse = (type: string | undefined, value: string) =>
  type === "number" ? (value === "" ? undefined : Number(value)) : value || undefined;

/** Turning the switch off also removes its associated value, including a custom field named by `clear`. */
export function Switch({
  label,
  on,
  value,
  type,
  field,
  clear,
}: {
  label: ReactNode;
  on: string;
  value?: string;
  type?: string;
  field?: ReactNode;
  clear?: string;
}) {
  const { settings, set } = useStore();
  const checked = !!settings[on];

  return (
    <>
      <Toggle
        checked={checked}
        onCheckedChange={(next) =>
          set({ [on]: next, ...(clear && !next && { [clear]: undefined }) })
        }
      >
        {label}
      </Toggle>
      {checked && value && (
        <Field
          type={type}
          value={settings[value]}
          onChange={(v) => set({ [value]: parse(type, v) })}
        />
      )}
      {checked && field}
    </>
  );
}

export function InternalAlias() {
  const { settings, set } = useStore();
  const id = useId();

  return (
    <>
      <Label>
        <label htmlFor={id}>Internal alias</label>
      </Label>
      <Field
        id={id}
        value={typeof settings.name === "string" ? settings.name : ""}
        controlled
        onChange={(name) => set({ name: name || undefined })}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="max-w-72 px-3.5 pb-1.5 text-12 leading-4 text-muted">
        Used to identify this question when its visible label is blank.
      </p>
    </>
  );
}

export function Value({
  label,
  value,
  type,
  fallback,
}: {
  label: string;
  value: string;
  type?: string;
  fallback?: Setting;
}) {
  const { settings, set } = useStore();

  return (
    <>
      <Label>{label}</Label>
      <Field
        type={type}
        value={settings[value] ?? fallback}
        onChange={(v) => set({ [value]: parse(type, v) })}
      />
    </>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className={cn(item, "cursor-default")}>
      <ItemLabel>{children}</ItemLabel>
    </div>
  );
}

export function Field({
  type = "text",
  value,
  onChange,
  controlled,
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value?: Setting;
  onChange: (value: string) => void;
  controlled?: boolean;
}) {
  return (
    <div className="px-3.5 pt-0.5 pb-1.5">
      <input
        {...props}
        type={type}
        {...(controlled
          ? { value: value === undefined ? "" : String(value) }
          : { defaultValue: value === undefined ? "" : String(value) })}
        onChange={(e) => onChange(e.target.value)}
        // The keys are the field's: the menu would take letters for typeahead and arrows for moving
        onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
        className={cn(compactInput, className)}
      />
    </div>
  );
}

/** SSB's repeat bounds: an invalid draft stays in the pair until focus leaves it. */
export function BoundsFields({
  min,
  max,
  onChange,
  className,
}: {
  min: number;
  max: number;
  onChange: (next: { min: number; max: number }) => void;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ min: string; max: string } | null>(null);
  const values = draft ?? { min: String(min), max: String(max) };
  const number = (text: string) => (text === "" ? NaN : Number(text));
  const error = boundsError(number(values.min), number(values.max));

  return (
    <div
      className={className}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setDraft(null)}
    >
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["min", "Start with"],
            ["max", "Allow up to"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-12 leading-4 text-muted">
            {label}
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={values[key]}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => {
                const next = { ...values, [key]: e.target.value };
                setDraft(next);
                const bounds = { min: number(next.min), max: number(next.max) };

                if (boundsError(bounds.min, bounds.max) === null) onChange(bounds);
              }}
              onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
              className="mt-1 h-8 w-full rounded-sm bg-white px-2 text-14 text-ink shadow-input outline-none placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus max-sm:text-16"
            />
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="pt-1.5 text-12 leading-4 text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function AnswerMoreThanOnce({
  value,
  auto,
  onChange,
}: {
  value?: FieldArray;
  auto: string;
  onChange: (next: FieldArray | undefined) => void;
}) {
  return (
    <>
      <Toggle
        checked={!!value}
        onCheckedChange={(on) => onChange(on ? { ...DEFAULT_FIELD_ARRAY } : undefined)}
      >
        Answer more than once
      </Toggle>
      {value && (
        <BoundsFields
          className="px-3.5 pt-0.5 pb-1.5"
          min={value.min}
          max={value.max}
          onChange={(bounds) => onChange({ ...value, ...bounds })}
        />
      )}
      {value && value.min < value.max && (
        <SsbField
          label="Add another button"
          value={value.addAnotherLabel ?? auto}
          pinned={!!value.addAnotherLabel}
          onChange={(text) => onChange(withText(value, "addAnotherLabel", text ?? ""))}
        />
      )}
    </>
  );
}

/** SSB values stay automatic until edited; clearing one restores its computed value. */
export function SsbField({
  label,
  value,
  pinned,
  fixed,
  onChange,
  validate,
  clash,
  mono,
  inline,
  required,
  muted,
  resetOnClear = true,
}: {
  label: string;
  value: string;
  pinned: boolean;
  fixed?: true;
  onChange: (value: string | undefined) => void;
  validate?: (value: string) => string | null;
  clash?: string;
  mono?: boolean;
  inline?: boolean;
  required?: boolean;
  muted?: boolean;
  resetOnClear?: boolean;
}) {
  const id = useId();
  const [editing, setEditing] = useState(!inline);
  const [draft, setDraft] = useState<string | null>(null);
  const text = fixed ? value : (draft ?? value);
  const error = fixed ? null : validate?.(text);
  const warning = required && isFieldless(text) ? "Say which answer is missing" : null;
  const note = error || warning;

  const name = (
    <>
      {label}
      {(fixed || !pinned) && (
        <span className="ml-2 text-12 font-normal text-muted">{fixed ? "fixed" : "auto"}</span>
      )}
    </>
  );

  return (
    <>
      {fixed && inline ? (
        <div className={cn(item, "cursor-default")}>
          <ItemLabel>{name}</ItemLabel>
          <Shortcut>
            <span className="font-mono">{value}</span>
          </Shortcut>
        </div>
      ) : editing ? (
        <>
          <Label>
            <label htmlFor={id} className={cn("block truncate", muted && "text-muted")}>
              {name}
            </label>
          </Label>
          <Field
            id={id}
            value={text}
            controlled
            readOnly={fixed}
            autoFocus={inline}
            className={mono ? "font-mono" : undefined}
            aria-invalid={!!error}
            aria-describedby={note ? `${id}-error` : undefined}
            onChange={(next) => {
              if (fixed) return;
              setDraft(next);

              if ((!next && resetOnClear) || !validate?.(next)) onChange(next || undefined);
            }}
            onBlur={() => {
              setDraft(null);

              if (inline) setEditing(false);
            }}
          />
        </>
      ) : (
        <Menu.Item closeOnClick={false} onClick={() => setEditing(true)} className={item}>
          <ItemLabel>{name}</ItemLabel>
          <Shortcut>
            <span className="font-mono">{value}</span>
          </Shortcut>
        </Menu.Item>
      )}
      {note && (
        <p id={`${id}-error`} className="px-3.5 pb-1.5 text-12 text-error">
          {note}
        </p>
      )}
      {clash && (
        <p className="px-3.5 pb-1.5 text-12 text-muted">
          <span className="font-mono">{clash}</span> is taken, so this exports as{" "}
          <span className="font-mono">{value}</span>
        </p>
      )}
    </>
  );
}

/** One setting from a list, shown as the current choice beside its label. */
export function Pick({
  label,
  value,
  options,
  fallback,
}: {
  label: string;
  value: string;
  options: Options;
  fallback: string;
}) {
  const { settings, set } = useStore();
  const chosen = options.find(([key]) => key === settings[value])?.[0] ?? fallback;

  return (
    <SubmenuRow label={label} text={options.find(([key]) => key === chosen)?.[1]}>
      <Menu.RadioGroup
        value={chosen}
        onValueChange={(picked) => set({ [value]: picked || undefined })}
        className={list}
      >
        {options.map(([key, name]) => (
          <Menu.RadioItem key={key} value={key} closeOnClick className={option}>
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <Menu.RadioItemIndicator className={check}>
              <Check />
            </Menu.RadioItemIndicator>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </SubmenuRow>
  );
}

export function SubmenuRow({
  label,
  icon,
  text,
  open,
  onOpenChange,
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  text?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** For the popup. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Menu.SubmenuRoot open={open} onOpenChange={onOpenChange}>
      <Menu.SubmenuTrigger
        openOnHover={false}
        className="group/turn relative mx-1 flex h-8 w-[calc(100%-8px)] cursor-pointer items-center justify-between gap-1.5 rounded-sm px-2.5 text-14 leading-4 whitespace-nowrap text-ink outline-none select-none data-highlighted:bg-blue-80 data-highlighted:text-white data-popup-open:not-data-highlighted:bg-hover [&_svg]:text-muted data-highlighted:[&_svg]:text-white"
      >
        <ItemLabel icon={icon}>{label}</ItemLabel>
        <div className="flex flex-1 items-center justify-end gap-1 overflow-hidden [&>svg]:size-4 [&>svg]:shrink-0">
          <div className="flex-1 truncate text-end text-12 leading-4 text-muted group-data-highlighted/turn:text-blue-20">
            {text}
          </div>
          <CaretDown />
        </div>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} className="z-50 outline-none">
          <Menu.Popup className={cn(popup, "min-w-40", className)}>{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

export function Toggle({
  checked,
  onCheckedChange,
  children,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Menu.CheckboxItem checked={checked} onCheckedChange={onCheckedChange} className={item}>
      <ItemLabel>{children}</ItemLabel>
      {/* On the highlighted row's navy: white when on, a translucent white track when off */}
      <Menu.CheckboxItemIndicator
        keepMounted
        className="relative h-4.5 w-7.5 shrink-0 rounded-full bg-grey-60 data-checked:bg-interactive group-data-highlighted/item:bg-white/40 group-data-highlighted/item:data-checked:bg-white"
      >
        <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white in-data-checked:left-3.5 group-data-highlighted/item:in-data-checked:bg-blue-80" />
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function Action({
  icon,
  shortcut,
  onClick,
  children,
}: {
  icon: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Menu.Item onClick={onClick} className={item}>
      <ItemLabel icon={icon}>{children}</ItemLabel>
      {shortcut && <Shortcut>{shortcut}</Shortcut>}
    </Menu.Item>
  );
}

export function ErrorMessages({
  errors,
  onChange,
}: {
  errors: BlockErrorMessage[];
  onChange: (error: BlockErrorMessage, text: string | undefined) => void;
}) {
  if (!errors.length) return null;

  return (
    <SubmenuRow label="Error messages" text={errors.length} className="w-90">
      <div className="min-h-0 overflow-y-auto py-1.5">
        {errors
          .filter(
            (error) =>
              "native" in error ||
              error.rule !== "onOrBefore" ||
              !errors.some((other) => !("native" in other) && other.rule === "onOrAfter"),
          )
          .map((error) => (
            <SsbField
              key={
                "native" in error
                  ? `${error.required ? "required" : "rule"}:${error.rule}`
                  : error.rule
              }
              label={error.label}
              value={error.message}
              pinned={error.pinned}
              onChange={(next) => onChange(error, next)}
              required={"native" in error ? error.required : error.rule === "required"}
            />
          ))}
      </div>
    </SubmenuRow>
  );
}
