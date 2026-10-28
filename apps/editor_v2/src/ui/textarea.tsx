import { Field as BaseField } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import { useCallback, useLayoutEffect, useRef, type ComponentProps, type Ref } from "react";
import { cn } from "../cn";
import { fieldFrame } from "./input";

const variants = {
  // Words, in the Input's padding and line height
  text: "px-2.5 py-2 leading-5",
  // Source, such as Markdown or JSON: monospaced at a code block's line height, on the field's own white, never the grey
  // of a field that can't be changed
  code: "p-3 font-mono leading-6",
};

// Hands the element to a ref, whichever kind it is
function setRef<T>(ref: Ref<T> | undefined, element: T | null) {
  if (ref instanceof Function) ref(element);
  else if (ref) ref.current = element;
}

type TextareaProps = ComponentProps<"textarea"> & {
  variant?: keyof typeof variants;
  /**
   * Grows with its words rather than scrolling inside itself, from `rows` (or a `min-h-*`) up: sized by the browser
   * where it can size a field to its content, and measured as its words and width change where it can't.
   */
  autoGrow?: boolean;
};

/** Several lines of text, in the Input's frame. In a Field, it takes the field's label, hint and error. */
export function Textarea({
  variant = "text",
  autoGrow = false,
  className,
  ref,
  ...props
}: TextareaProps) {
  const own = useRef<HTMLTextAreaElement>(null);

  const both = useCallback(
    (element: HTMLTextAreaElement | null) => {
      own.current = element;
      setRef(ref, element);
    },
    [ref],
  );

  useLayoutEffect(() => {
    const element = own.current;

    if (!autoGrow || !element || globalThis.CSS?.supports("field-sizing", "content")) return;

    const fit = () => {
      // Hidden, it has no width to measure in, so it's fitted once it shows
      if (!element.clientWidth) return;
      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    };

    let width = element.clientWidth;

    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fit();
    });

    fit();
    observer.observe(element);
    element.addEventListener("input", fit);

    return () => {
      observer.disconnect();
      element.removeEventListener("input", fit);
    };
  }, [autoGrow, props.value]);

  return (
    <BaseField.Control
      // SAFETY: Field.Control merges this with its own ref and gives both to the element it renders: this textarea.
      // Passed through mergeProps instead, the caller's ref would replace Base UI's
      ref={both as Ref<HTMLInputElement>}
      render={(control) => (
        <textarea
          {...mergeProps<"textarea">(control, props)}
          className={cn(
            fieldFrame,
            "block w-full",
            variants[variant],
            autoGrow && "resize-none supports-[field-sizing:content]:field-sizing-content",
            className,
          )}
        />
      )}
    />
  );
}
