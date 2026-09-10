import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@base-ui/react/toast";
import { Tooltip, TooltipProvider } from "../tooltip";
import { Button } from "../button";
import { inputVariants } from "../input";
import { cn } from "../utils/cn";
import { resolveVariant } from "../utils/resolve-variant";
// External manager — same-id re-adds update + reset timeout in Base UI's store
const clipboardToastManager = Toast.createToastManager();
const COPIED_FEEDBACK_MS = 1500;
/** ClipboardText size variant definitions mapping sizes to their Tailwind classes. */
const clipboardTextStyles = {
  size: {
    sm: {
      classes: "text-xs",
      buttonSize: "sm" as const,
    },
    base: {
      classes: "text-sm",
      buttonSize: "base" as const,
    },
    lg: {
      classes: "text-sm",
      buttonSize: "lg" as const,
    },
  },
} as const;
const clipboardTextAnimations = {
  slide: {
    initial:
      "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 translate-y-full",
    animate: "translate-y-0 opacity-100",
    end: "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 -translate-y-full",
  },
} as const;
export type ClipboardTextSize = keyof typeof clipboardTextStyles.size;
export interface ClipboardTextVariantsProps {
  size?: ClipboardTextSize;
}
export function clipboardTextVariants({
  size = "lg",
}: ClipboardTextVariantsProps = {}) {
  return cn(
    // Base styles
    "flex items-center overflow-hidden bg-ui-base px-0 font-mono",
    resolveVariant(clipboardTextStyles.size, size, "lg").classes,
  );
}
export interface ClipboardTextProps extends ClipboardTextVariantsProps {
  /** The text to display and copy to clipboard. */
  text: string;
  /** If provided, this text will be copied to clipboard instead of the `text` prop. */
  textToCopy?: string;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** Callback fired after text is copied to clipboard. */
  onCopy?: () => void;
  tooltip?: {
    /** Text shown in tooltip on hover. @default "Copy" */
    text?: string;
    /** Text shown in toast after copying. @default "Copied" */
    copiedText?: string;
    /** Tooltip/toast placement. @default "top" */
    side?: "top" | "bottom" | "left" | "right";
  };
  /** Accessible labels for i18n. */
  labels?: {
    /** @default "Copy to clipboard" */
    copyAction?: string;
  };
}
/**
 * Anchored toasts viewport - renders "Copied" toasts anchored to buttons
 */
function AnchoredToasts() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Viewport className="pointer-events-none fixed inset-0 isolate">
      {toasts.map((toast) => {
        const updateKey = toast.updateKey ?? 0;
        return (
          <Toast.Positioner key={toast.id} toast={toast} className="absolute">
            {/* key forces a fresh animation instance on every bump */}
            <Toast.Root
              key={updateKey}
              toast={toast}
              className={cn(
                "flex origin-[var(--transform-origin)] flex-col rounded-md bg-ui-base px-3 py-1.5 font-sans text-xs text-ui-default",
                "shadow-lg outline outline-ui-hairline",
                updateKey > 0 && "animate-clipboard-toast-bump",
              )}
            >
              <Toast.Description />
            </Toast.Root>
          </Toast.Positioner>
        );
      })}
    </Toast.Viewport>
  );
}
/**
 * Internal wrapper that provides Toast context when tooltip is enabled.
 */
function TooltipWrapper({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Toast.Provider toastManager={clipboardToastManager}>
        <AnchoredToasts />
        {children}
      </Toast.Provider>
    </TooltipProvider>
  );
}
export const ClipboardText = forwardRef<HTMLDivElement, ClipboardTextProps>(
  (
    {
      text,
      textToCopy,
      className,
      size = "lg",
      onCopy,
      tooltip,
      labels: { copyAction = "Copy to clipboard" } = {},
    },
    ref,
  ) => {
    const [copied, setCopied] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastIdRef = useRef<string | null>(null);
    const sizeConfig = resolveVariant(clipboardTextStyles.size, size, "lg");
    // Destructure tooltip config with defaults
    const {
      text: tooltipText = "Copy",
      copiedText = "Copied",
      side: tooltipSide = "top",
    } = tooltip ?? {};
    useEffect(() => {
      return () => {
        if (resetTimeoutRef.current !== null) {
          clearTimeout(resetTimeoutRef.current);
        }
      };
    }, []);
    const scheduleCopiedReset = useCallback(() => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, COPIED_FEEDBACK_MS);
    }, []);
    const copyToClipboard = useCallback(async () => {
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          await navigator.clipboard.writeText(textToCopy ?? text);
        } else if (typeof document !== "undefined") {
          // Fallback for older browsers
          const textarea = document.createElement("textarea");
          textarea.value = textToCopy ?? text;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          const selection = document.getSelection();
          const previousRange = selection?.rangeCount
            ? selection.getRangeAt(0)
            : null;
          textarea.select();
          try {
            document.execCommand("copy");
          } finally {
            document.body.removeChild(textarea);
            if (previousRange) {
              selection?.removeAllRanges();
              selection?.addRange(previousRange);
            }
          }
        }
        setCopied(true);
        // Show anchored toast if tooltip mode is enabled
        if (tooltip) {
          toastIdRef.current = clipboardToastManager.add({
            id: toastIdRef.current ?? undefined,
            description: copiedText,
            positionerProps: {
              anchor: buttonRef.current,
              side: tooltipSide,
              sideOffset: 8,
            },
            timeout: COPIED_FEEDBACK_MS,
            onClose() {
              toastIdRef.current = null;
              setCopied(false);
            },
          });
        } else {
          // Keep check icon visible; only reset after the last click settles
          scheduleCopiedReset();
        }
        onCopy?.();
      } catch (error) {
        console.warn("Clipboard copy failed", error);
      }
    }, [
      text,
      textToCopy,
      onCopy,
      tooltip,
      copiedText,
      tooltipSide,
      scheduleCopiedReset,
    ]);
    const copyButton = (
      <Button
        ref={buttonRef}
        size={sizeConfig.buttonSize}
        variant="ghost"
        className={cn(
          "relative isolate overflow-hidden rounded-l-none rounded-r-[inherit] border-l! border-ui-hairline! px-3 transition-all duration-200",
          "focus:ring-ui-focus/50 focus:ring-inset",
          "focus-visible:ring-2 focus-visible:ring-ui-brand focus-visible:ring-inset",
        )}
        onClick={copyToClipboard}
        aria-label={copyAction}
      >
        <span
          className={cn(
            "flex items-center gap-1 transition-all duration-200",
            copied
              ? clipboardTextAnimations.slide.animate
              : clipboardTextAnimations.slide.initial,
          )}
        >
          <CheckIcon />
        </span>
        <span
          className={cn(
            "flex items-center justify-center transition-all duration-200",
            copied
              ? clipboardTextAnimations.slide.end
              : clipboardTextAnimations.slide.animate,
          )}
        >
          <CopyIcon />
        </span>
      </Button>
    );
    return (
      <div
        ref={ref}
        className={cn(
          inputVariants({ size: sizeConfig.buttonSize }),
          clipboardTextVariants({ size }),
          className,
        )}
      >
        <span className="grow truncate ps-4 pe-2">{text}</span>
        {tooltip ? (
          <TooltipWrapper>
            <Tooltip
              content={tooltipText}
              side={tooltipSide}
              render={copyButton}
              disabled={copied}
              onOpenChange={(open, eventDetails) => {
                // Prevent tooltip from closing when button is clicked
                if (eventDetails.reason === "trigger-press") {
                  eventDetails.cancel();
                }
              }}
            />
          </TooltipWrapper>
        ) : (
          copyButton
        )}
        <span className="sr-only" aria-live="polite">
          {copied ? copiedText : ""}
        </span>
      </div>
    );
  },
);
ClipboardText.displayName = "ClipboardText";
