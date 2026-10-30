import { Input as BaseInput } from "@base-ui/react/input";
import { cn } from "../cn";
import { useFieldSize } from "./field";

// A hairline that darkens on hover and becomes the focus ring. An error edges it in red, but focus still shows over it.
// 44px on a touch screen, like a menu's rows, and 16px text on phones, so iOS doesn't zoom in on focus
export const fieldFrame =
  "rounded-sm bg-white text-14 text-ink shadow-input outline-none focus-visible:outline-hidden placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus aria-invalid:shadow-input-error aria-invalid:focus:shadow-input-focus disabled:cursor-not-allowed disabled:bg-tint disabled:text-muted disabled:shadow-none pointer-coarse:min-h-11 max-sm:text-16";

const sizes = {
  // A settings or dialog field
  md: "h-9 px-2.5",
  // A field in a popover or a toolbar
  sm: "h-8 px-2",
};

type Size = keyof typeof sizes;

/** Classes for an Input, for the odd element that can't be an <Input>, such as a combobox's text box. */
export const input = (size: Size = "md") => cn(fieldFrame, "w-full", sizes[size]);

type InputProps = Omit<BaseInput.Props, "size" | "className"> & { size?: Size; className?: string };

/** A line of text. In a Field, it takes the field's label, hint, error and size. */
export function Input({ size, className, ...props }: InputProps) {
  const fieldSize = useFieldSize();

  return <BaseInput className={cn(input(size ?? fieldSize), className)} {...props} />;
}
