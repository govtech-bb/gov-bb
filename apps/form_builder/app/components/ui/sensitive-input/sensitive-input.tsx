import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { CopyIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { Input, type InputProps } from "../input/input";
import { Button } from "../button/button";
import { Field } from "../field/field";
import { cn } from "../utils/cn";

export type SensitiveInputProps = Omit<InputProps, "type">;

export const SensitiveInput = forwardRef<HTMLInputElement, SensitiveInputProps>(
  function SensitiveInput(
    {
      label,
      labelTooltip,
      description,
      error,
      className,
      size = "base",
      ...props
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [revealed, setRevealed] = useState(false);
    const [copyMessage, setCopyMessage] = useState("");
    useImperativeHandle(ref, () => inputRef.current!);

    async function copy() {
      try {
        await navigator.clipboard.writeText(inputRef.current?.value ?? "");
        setCopyMessage("Copied to clipboard.");
      } catch {
        setCopyMessage(
          "Could not copy. Select the value and copy it manually.",
        );
      }
    }

    const control = (
      <div data-ui-component="SensitiveInput" className="relative min-w-0">
        <Input
          {...props}
          ref={inputRef}
          type={revealed ? "text" : "password"}
          size={size}
          variant={props.variant}
          className={cn("w-full pe-16", className)}
        />
        <div className="absolute inset-y-0 end-1 flex items-center gap-0.5">
          <Button
            size="xs"
            shape="square"
            variant="ghost"
            disabled={props.disabled}
            aria-label={revealed ? "Hide value" : "Reveal value"}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeSlashIcon /> : <EyeIcon />}
          </Button>
          <Button
            size="xs"
            shape="square"
            variant="ghost"
            disabled={props.disabled}
            aria-label="Copy value"
            onClick={copy}
          >
            <CopyIcon />
          </Button>
        </div>
        <span role="status" className="sr-only">
          {copyMessage}
        </span>
      </div>
    );
    return label != null || description || error ? (
      <Field
        label={label}
        labelTooltip={labelTooltip}
        description={description}
        error={error}
        required={props.required}
      >
        {control}
      </Field>
    ) : (
      control
    );
  },
);
