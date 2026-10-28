import { useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";

/**
 * A Button that opens the system's file picker, such as Replace from file: its file input stays hidden, and the file
 * chosen comes to `onFile`. The same file can be chosen again straight after, as when it was edited meanwhile.
 */
export function FileButton({
  accept,
  icon,
  variant,
  disabled,
  onFile,
  children,
}: {
  /** The kinds of file it takes, as the input's `accept`, such as “.md,text/markdown”. */
  accept?: string;
  icon?: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  onFile: (file: File) => void;
  /** What a press does, such as “Replace from file”. */
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        icon={icon}
        variant={variant}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          // Emptied, so choosing the same file again still counts as a change
          event.currentTarget.value = "";

          if (file) onFile(file);
        }}
      />
    </>
  );
}
