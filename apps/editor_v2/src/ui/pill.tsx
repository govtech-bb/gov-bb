import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { CaretDown } from "@phosphor-icons/react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "../cn";
import { touchTarget } from "./surface";

/**
 * Classes for a pill, for the odd element that can't be a <Pill>. 44px under a coarse pointer, like a field. Its
 * placeholder, a trigger's data-placeholder or an empty input's, is muted where a chosen value is ink.
 */
export const pill = `inline-flex h-8 max-w-80 min-w-0 items-center gap-1.5 rounded-sm bg-white px-2.5 text-14 leading-none font-semibold text-ink shadow-input outline-none transition-shadow hover:shadow-input-hover focus-visible:shadow-input-focus has-focus-visible:shadow-input-focus aria-expanded:shadow-input-focus has-aria-expanded:shadow-input-focus data-placeholder:text-muted has-placeholder-shown:text-muted ${touchTarget}`;

export const pillIcon = "inline-flex shrink-0 items-center text-muted [&>svg]:size-3.5";

/** The caret on a pill that opens a list: the size of a select's, so every caret in the tool is 14px. */
export const pillChevron = "inline-flex shrink-0 items-center text-muted [&>svg]:size-3.5";

const tones = {
  // On the white sheet or in a popover
  default: "",
  // A rule written on the form's own white sheet, as native forms keep them: the desk's grey marks it as the author's.
  // It keeps the pill's 3:1 edge, its muted placeholder and the one radius
  quiet: "bg-tint hover:bg-hover aria-expanded:bg-hover has-aria-expanded:bg-hover",
};

export type PillTone = keyof typeof tones;

/** A pill's classes in a tone, for a trigger that draws itself as one, such as Select's. */
export const pillLook = (tone: PillTone = "default") => cn(pill, tones[tone]);

type PillProps = Omit<useRender.ComponentProps<"span">, "className"> & {
  tone?: PillTone;
  className?: string;
};

/**
 * A word in a sentence that sets a value, such as a logic rule's question or its answer, as wide as its value. A span
 * that holds a Pill.Input, or with `render` the trigger that opens its list: `render={<Popover.Trigger />}`. Mark a
 * trigger with nothing chosen `data-placeholder`, as Select's and Combobox's mark themselves.
 */
export function Pill({ tone, render, className, ...props }: PillProps) {
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      { className: cn(pillLook(tone), render && "cursor-pointer", className) },
      props,
    ),
  });
}

/** The icon before a pill's value. */
function PillIcon({ children }: { children: ReactNode }) {
  return <span className={pillIcon}>{children}</span>;
}

/** After the value of a pill that opens a list. */
function PillCaret() {
  return (
    <span aria-hidden="true" className={pillChevron}>
      <CaretDown />
    </span>
  );
}

type PillInputProps = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "placeholder" | "type" | "size" | "className"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  /** Its name, where the placeholder doesn't say what it is. */
  label?: string;
};

/** Words typed into a pill, which is as wide as they are: an invisible copy of them sizes it. */
function PillInput({
  defaultValue = "",
  value: controlled,
  onValueChange,
  placeholder,
  label,
  ...props
}: PillInputProps) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;

  return (
    <span className="relative inline-flex min-w-0">
      <span aria-hidden className="invisible min-w-[1ch] leading-normal whitespace-pre">
        {value || placeholder}
      </span>
      <input
        aria-label={label ?? placeholder}
        data-1p-ignore
        {...props}
        type="text"
        size={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setOwn(e.target.value);
          onValueChange?.(e.target.value);
        }}
        className="absolute inset-0 w-full min-w-0 leading-normal text-ellipsis outline-none placeholder:text-inherit"
      />
    </span>
  );
}

Pill.Icon = PillIcon;

Pill.Input = PillInput;

Pill.Caret = PillCaret;
