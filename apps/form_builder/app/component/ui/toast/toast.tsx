import { Toast } from "@base-ui/react/toast";
import type React from "react";
import { cn } from "../utils/cn";
import { resolveVariant } from "../utils/resolve-variant";
import { Button, ButtonProps } from "../button";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  WarningOctagonIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
const toastStyles = {
  root: {
    classes:
      "rounded-lg border border-ui-tint bg-ui-control p-4 shadow-lg text-ui-default",
  },
  title: {
    classes: "text-[0.975rem] leading-5 font-medium text-ui-default",
  },
  close: {
    classes:
      "absolute top-2 right-2 size-5 rounded text-ui-subtle hover:bg-current/15",
  },
  variant: {
    default: {
      classes: "border-ui-tint bg-ui-base",
    },
    success: {
      classes:
        "ring-[0.3px] ring-ui-success bg-ui-base [&_[data-toast-icon]]:text-ui-success [&_[data-toast-title]]:text-ui-success",
      icon: CheckCircleIcon,
    },
    error: {
      classes:
        "ring-[0.3px] ring-ui-danger bg-ui-base [&_[data-toast-icon]]:text-ui-danger [&_[data-toast-title]]:text-ui-danger",
      icon: WarningOctagonIcon,
    },
    warning: {
      classes:
        "ring-[0.3px] ring-ui-warning bg-ui-base [&_[data-toast-icon]]:text-ui-warning [&_[data-toast-title]]:text-ui-warning",
      icon: WarningIcon,
    },
    info: {
      classes:
        "ring-[0.3px] ring-ui-info bg-ui-control [&_[data-toast-icon]]:text-ui-info [&_[data-toast-title]]:text-ui-info",
      icon: InfoIcon,
    },
  },
} as const;
export type ToastVariant = keyof typeof toastStyles.variant;
export interface ToastVariantsProps {
  variant?: ToastVariant;
}
export function toastVariants({
  variant = "default",
}: ToastVariantsProps = {}) {
  return cn(
    // Base styles for toast root
    "rounded-xl ring ring-ui-hairline bg-clip-padding p-4 shadow-lg",
    resolveVariant(toastStyles.variant, variant, "default").classes,
  );
}
export type ToastData = {
  content?: React.ReactNode;
  actions?: Array<ButtonProps>;
};
export const useToastManager = Toast.useToastManager<ToastData>;
export const createToastManager = Toast.createToastManager<ToastData>;
export type ToastProviderProps = Toast.Provider.Props & {
  container?: PortalContainer;
};
export function ToastProvider({
  children,
  container: containerProp,
  toastManager,
  ...props
}: ToastProviderProps) {
  const contextContainer = usePortalContainer();
  const container = containerProp ?? contextContainer ?? undefined;
  return (
    <Toast.Provider {...props} toastManager={toastManager}>
      {children}
      <Toast.Portal container={container}>
        <Toast.Viewport className="fixed top-auto right-4 bottom-4 z-[100] mx-auto flex w-[calc(100%-2rem)] sm:right-8 sm:bottom-8 sm:w-[340px]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
function ToastList() {
  const { toasts } = useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={cn(
        "absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] mr-0 h-[var(--height)] w-full origin-bottom select-none",
        toastVariants({ variant: toast.type as ToastVariant | undefined }),
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_160ms_cubic-bezier(0.2,0,0,1),opacity_120ms,height_160ms]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-[ending-style]:opacity-0 data-[expanded]:h-[var(--toast-height)] data-[expanded]:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-[limited]:opacity-0 data-[starting-style]:[transform:translateY(150%)]",
        "data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-[expanded]:data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-[ending-style]:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-[expanded]:data-[ending-style]:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-[ending-style]:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-[expanded]:data-[ending-style]:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-[ending-style]:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))] data-[expanded]:data-[ending-style]:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
      )}
    >
      <ToastBackground variant={toast.type as ToastVariant | undefined} />
      <Toast.Content className="isolate flex flex-col gap-1 transition-opacity duration-120 data-[behind]:pointer-events-none data-[behind]:opacity-0 data-[expanded]:pointer-events-auto data-[expanded]:opacity-100">
        {toast.data?.content ?? (
          <>
            <div className="flex items-start gap-2">
              <ToastIcon variant={toast.type as ToastVariant | undefined} />
              <div className="flex flex-col gap-1 overflow-hidden">
                <Toast.Title
                  data-toast-title
                  className="text-[0.975rem] leading-5 font-medium text-ui-default"
                />
                <Toast.Description className="text-[0.925rem] leading-5 text-ui-default/70" />

                {toast.actionProps && (
                  <Toast.Action render={<Button size="sm" />} />
                )}
                {!!toast.data?.actions && (
                  <div className="mt-2 flex min-w-0 flex-nowrap gap-2 ui-scroll-native overflow-x-auto p-px">
                    {toast.data?.actions.map((actionProps, idx) => (
                      <Button key={idx} {...actionProps} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <Toast.Close
          data-ui-part="close"
          aria-label="Close"
          render={
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              aria-label="Close"
              className={cn(
                "absolute top-2 right-2 size-5 rounded text-ui-subtle hover:bg-current/15",
                toast.type && TOAST_CLOSE_CLASSES[toast.type],
              )}
              icon={<XIcon className="h-3 w-3" />}
            />
          }
        />
      </Toast.Content>
    </Toast.Root>
  ));
}
const TOAST_CLOSE_CLASSES: Record<string, string> = {
  success: "text-ui-success",
  error: "text-ui-danger",
  warning: "text-ui-warning",
  info: "text-ui-info",
};
const TOAST_BACKGROUND_CLASSES: Record<string, string> = {
  success: "bg-ui-success-tint/20",
  error: "bg-ui-danger-tint/50",
  warning: "bg-ui-warning-tint/50",
  info: "bg-ui-info-tint/50",
};
function ToastBackground({ variant }: { variant?: ToastVariant }) {
  const background = variant && TOAST_BACKGROUND_CLASSES[variant];
  return (
    <div
      className={cn("absolute inset-0 rounded-xl bg-ui-base/90", background)}
    />
  );
}
function ToastIcon({ variant }: { variant?: ToastVariant }) {
  if (!variant || variant === "default") return null;
  const variantConfig = resolveVariant(toastStyles.variant, variant, "default");
  if (!("icon" in variantConfig)) return null;
  const Icon = variantConfig.icon;
  return (
    <Icon data-toast-icon className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
  );
}
