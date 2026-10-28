import { useState } from "react";
import { touchTarget } from "./surface";

/** Shared compact control for calculated values and conditional logic. 44px under a coarse pointer, like a field. */
export const pill = `inline-flex h-8 max-w-80 min-w-0 items-center gap-1.5 rounded-sm bg-white px-2.5 text-14 leading-none font-semibold text-ink shadow-input outline-none transition-shadow hover:shadow-input-hover focus-visible:shadow-input-focus has-focus-visible:shadow-input-focus aria-expanded:shadow-input-focus has-aria-expanded:shadow-input-focus data-placeholder:text-muted has-placeholder-shown:text-muted ${touchTarget}`;

export const pillIcon = "inline-flex shrink-0 items-center text-muted [&>svg]:size-3.5";

/** The caret on a pill that opens a list: the size of a select's, so every caret in the tool is 14px. */
export const pillChevron = "inline-flex shrink-0 items-center text-muted [&>svg]:size-3.5";

/** An invisible text copy sizes the input; value/onChange optionally control it. */
export function PillInput({
  defaultValue = "",
  value: controlled,
  onChange,
  placeholder,
  label,
}: {
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  label?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;

  const setValue = (next: string) => {
    setOwn(next);
    onChange?.(next);
  };

  return (
    <span className="relative inline-flex min-w-0">
      <span aria-hidden className="invisible min-w-[1ch] leading-normal whitespace-pre">
        {value || placeholder}
      </span>
      <input
        type="text"
        size={1}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        data-1p-ignore
        onChange={(e) => setValue(e.target.value)}
        className="absolute inset-0 w-full min-w-0 leading-normal text-ellipsis outline-none placeholder:text-inherit"
      />
    </span>
  );
}
