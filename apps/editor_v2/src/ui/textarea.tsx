import { Field as BaseField } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import type { ComponentProps, Ref } from "react";
import { cn } from "../cn";
import { fieldFrame } from "./input";

/** Several lines of text, in the Input's frame. In a Field, it takes the field's label, hint and error. */
export function Textarea({ className, ref, ...props }: ComponentProps<"textarea">) {
  return (
    <BaseField.Control
      // SAFETY: Field.Control merges this with its own ref and gives both to the element it renders: this textarea.
      // Passed through mergeProps instead, the caller's ref would replace Base UI's
      ref={ref as Ref<HTMLInputElement>}
      render={(control) => (
        <textarea
          {...mergeProps<"textarea">(control, props)}
          className={cn(fieldFrame, "block w-full px-2.5 py-2 leading-5", className)}
        />
      )}
    />
  );
}
