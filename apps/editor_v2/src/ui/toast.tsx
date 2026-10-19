import { Toast as BaseToast } from "@base-ui/react/toast";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import { cn } from "../cn";
import { Button } from "./button";

const manager = BaseToast.createToastManager();

const icons = {
  success: <CheckCircle className="text-green-80" />,
  info: <Info className="text-blue-80" />,
  error: <WarningCircle className="text-error" />,
};

type ToastTone = keyof typeof icons;

/**
 * Confirms what an action did once its own control has gone, such as a dialog that closed or a page that was left.
 * An error is read out at once; anything else when the reader is free. Callable from anywhere: <Toaster> shows it.
 * An action, such as Undo, is a button in the toast that also dismisses it. Returns the toast's id, for `dismissToast`.
 */
export function toast(
  title: string,
  options: {
    description?: string;
    tone?: ToastTone;
    action?: { label: string; onClick: () => void };
  } = {},
) {
  const { description, tone = "success", action } = options;

  return manager.add({
    title,
    description,
    type: tone,
    priority: tone === "error" ? "high" : "low",
    actionProps: action && { children: action.label, onClick: action.onClick },
  });
}

/** Takes a toast away early, such as an Undo that no longer applies. */
export const dismissToast = (id: string) => manager.close(id);

// The stack, after Base UI's own: the newest toast in front, older ones peeking out above it, each a little smaller,
// until a pointer or focus in the viewport spreads them out. --toast-* variables come from Base UI
const stack = [
  "[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.05)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))]",
  "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
  "absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] h-(--height) w-full origin-bottom",
  "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
  "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))]",
  // The gap between spread toasts still counts as the viewport, so the stack doesn't close as the pointer crosses it
  "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
];

// In from below; out the way it was swiped, or down
const motion = [
  "[transition:transform_400ms_var(--ease-out-quint),opacity_400ms,height_150ms] motion-reduce:[transition:opacity_200ms]",
  "data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0 data-limited:opacity-0",
  "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
  "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
  "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
  "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
  "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
];

function Toasts() {
  const { toasts } = BaseToast.useToastManager();

  return toasts.map((item) => (
    <BaseToast.Root
      key={item.id}
      toast={item}
      className={cn(
        stack,
        motion,
        "rounded-sm bg-white text-14 leading-5 text-ink shadow-popup select-none",
      )}
    >
      {/* Behind the front toast, only its frame shows until the stack spreads */}
      <BaseToast.Content className="flex items-start gap-2.5 overflow-hidden py-3 ps-3.5 pe-2 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100">
        <span aria-hidden="true" className="mt-0.5 flex shrink-0 [&>svg]:size-4">
          {icons[item.type === "error" || item.type === "info" ? item.type : "success"]}
        </span>
        <div className="min-w-0 flex-1">
          <BaseToast.Title className="font-semibold" />
          <BaseToast.Description className="text-muted" />
        </div>
        {/* Renders only for a toast with an action; acting on it is the toast's last job */}
        <BaseToast.Action
          onClick={() => manager.close(item.id)}
          className="-my-1 h-7 shrink-0 cursor-pointer rounded-sm px-2 font-semibold text-interactive hover:bg-hover hover:text-interactive-active pointer-coarse:h-11"
        />
        <BaseToast.Close
          render={<Button icon={<X />} aria-label="Dismiss" className="-my-1.5" />}
        />
      </BaseToast.Content>
    </BaseToast.Root>
  ));
}

/** Where toasts appear: bottom right, above dialogs. Render it once, at the root. */
export function Toaster() {
  return (
    <BaseToast.Provider toastManager={manager}>
      <BaseToast.Portal>
        <BaseToast.Viewport className="fixed right-4 bottom-4 z-70 w-[calc(100vw-2rem)] sm:right-6 sm:bottom-6 sm:w-88">
          <Toasts />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
