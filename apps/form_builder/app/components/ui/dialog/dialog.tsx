import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Dialog as DialogBase } from "@base-ui/react/dialog";
import { AlertDialog as AlertDialogBase } from "@base-ui/react/alert-dialog";
import { Elevated } from "../surface/elevation";
import { Button } from "../button";
import { XIcon } from "@phosphor-icons/react";
import { cn } from "../utils/cn";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";
/** Dialog size variant definitions mapping sizes to their minimum widths. */
const dialogStyles = {
  size: {
    base: "sm:w-[400px]",
    sm: "sm:w-[360px]",
    lg: "sm:w-[540px]",
    xl: "sm:w-[880px]",
  },
  role: {
    dialog: "",
    alertdialog: "",
  },
} as const;
export type DialogSize = keyof typeof dialogStyles.size;
export type DialogRole = keyof typeof dialogStyles.role;
export interface DialogVariantsProps {
  size?: DialogSize;
}
// ============================================================================
// Dialog Role Context
// ============================================================================
const DialogRoleContext = createContext<DialogRole>("dialog");
function useDialogRole() {
  return useContext(DialogRoleContext);
}
export function dialogVariants({ size = "base" }: DialogVariantsProps = {}) {
  return cn(
    // Base styles
    "ui-dialog fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 ui-scroll-native overflow-y-auto rounded-xl p-6 text-ui-default focus:outline-none",
    dialogStyles.size[size] ?? dialogStyles.size["base"],
  );
}
export type DialogProps = DialogVariantsProps & {
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** Dialog content (typically Title, Description, Close, and action buttons). */
  children: ReactNode;
  /** Inline styles. */
  style?: CSSProperties;
  container?: PortalContainer;
  /** Show the corner close button. Defaults to true for standard dialogs. */
  showCloseButton?: boolean;
  keepMounted?: boolean;
  backdrop?: boolean;
  initialFocus?: DialogBase.Popup.Props["initialFocus"];
  finalFocus?: DialogBase.Popup.Props["finalFocus"];
  "aria-label"?: string;
};
function DialogContent({
  className,
  children,
  style,
  size = "base",
  container: containerProp,
  showCloseButton,
  keepMounted,
  backdrop = true,
  initialFocus,
  finalFocus,
  "aria-label": ariaLabel,
}: DialogProps) {
  const role = useDialogRole();
  const contextContainer = usePortalContainer();
  const container = containerProp ?? contextContainer ?? undefined;
  const BasePortal =
    role === "alertdialog" ? AlertDialogBase.Portal : DialogBase.Portal;
  const BaseBackdrop =
    role === "alertdialog" ? AlertDialogBase.Backdrop : DialogBase.Backdrop;
  const BasePopup =
    role === "alertdialog" ? AlertDialogBase.Popup : DialogBase.Popup;
  return (
    <BasePortal container={container} keepMounted={keepMounted}>
      {backdrop && <BaseBackdrop className="ui-backdrop fixed inset-0 z-50" />}
      <Elevated
        offset={4}
        shadowLevel={5}
        render={
          <BasePopup
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            aria-label={ariaLabel}
          />
        }
        className={cn(dialogVariants({ size }), className)}
        style={style}
      >
        {children}
        {(showCloseButton ?? role === "dialog") && (
          <DialogClose
            render={
              <Button
                variant="ghost"
                shape="square"
                size="sm"
                className="absolute right-3 top-3"
                aria-label="Close dialog"
              />
            }
          >
            <XIcon size={16} />
          </DialogClose>
        )}
      </Elevated>
    </BasePortal>
  );
}
// ============================================================================
// Dialog Root
// ============================================================================
type BaseDialogRootProps = ComponentPropsWithoutRef<typeof DialogBase.Root>;
type BaseAlertDialogRootProps = ComponentPropsWithoutRef<
  typeof AlertDialogBase.Root
>;
type StandardDialogRootProps = BaseDialogRootProps & {
  role?: "dialog";
};
type AlertDialogRootProps = BaseAlertDialogRootProps & {
  role: "alertdialog";
};
export type DialogRootProps = StandardDialogRootProps | AlertDialogRootProps;
function DialogRoot(props: DialogRootProps) {
  if (props.role === "alertdialog") {
    const { children, role, ...rootProps } = props;
    return (
      <DialogRoleContext.Provider value={role}>
        <AlertDialogBase.Root {...rootProps}>{children}</AlertDialogBase.Root>
      </DialogRoleContext.Provider>
    );
  }
  const { children, role = "dialog", ...rootProps } = props;
  return (
    <DialogRoleContext.Provider value={role}>
      <DialogBase.Root {...rootProps}>{children}</DialogBase.Root>
    </DialogRoleContext.Provider>
  );
}
DialogRoot.displayName = "Dialog.Root";
// ============================================================================
// Dialog Trigger
// ============================================================================
type BaseDialogTriggerProps = ComponentPropsWithoutRef<
  typeof DialogBase.Trigger
>;
type BaseAlertDialogTriggerProps = ComponentPropsWithoutRef<
  typeof AlertDialogBase.Trigger
>;
export type DialogTriggerProps =
  | BaseDialogTriggerProps
  | BaseAlertDialogTriggerProps;
function DialogTrigger({ children, ...props }: DialogTriggerProps) {
  const role = useDialogRole();
  if (role === "alertdialog") {
    return (
      <AlertDialogBase.Trigger
        data-ui-component="Dialog"
        data-ui-part="trigger"
        {...(props as BaseAlertDialogTriggerProps)}
      >
        {children}
      </AlertDialogBase.Trigger>
    );
  }
  return (
    <DialogBase.Trigger
      data-ui-component="Dialog"
      data-ui-part="trigger"
      {...props}
    >
      {children}
    </DialogBase.Trigger>
  );
}
DialogTrigger.displayName = "Dialog.Trigger";
// ============================================================================
// Dialog Title
// ============================================================================
type BaseDialogTitleProps = ComponentPropsWithoutRef<typeof DialogBase.Title>;
export type DialogTitleProps = BaseDialogTitleProps;
function DialogTitle({ className, ...props }: DialogTitleProps) {
  const role = useDialogRole();
  const BaseTitle =
    role === "alertdialog" ? AlertDialogBase.Title : DialogBase.Title;
  return (
    <BaseTitle
      className={cn(
        "pr-6 text-base font-bold leading-tight text-ui-default",
        className,
      )}
      {...props}
    />
  );
}
DialogTitle.displayName = "Dialog.Title";
// ============================================================================
// Dialog Description
// ============================================================================
type BaseDialogDescriptionProps = ComponentPropsWithoutRef<
  typeof DialogBase.Description
>;
export type DialogDescriptionProps = BaseDialogDescriptionProps;
function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  const role = useDialogRole();
  const BaseDescription =
    role === "alertdialog"
      ? AlertDialogBase.Description
      : DialogBase.Description;
  return (
    <BaseDescription
      className={cn("text-[13px] text-ui-subtle", className)}
      {...props}
    />
  );
}
DialogDescription.displayName = "Dialog.Description";
// ============================================================================
// Dialog Close
// ============================================================================
type BaseDialogCloseProps = ComponentPropsWithoutRef<typeof DialogBase.Close>;
export type DialogCloseProps = BaseDialogCloseProps;
function DialogClose({ children, ...props }: DialogCloseProps) {
  const role = useDialogRole();
  const BaseClose =
    role === "alertdialog" ? AlertDialogBase.Close : DialogBase.Close;
  return (
    <BaseClose data-ui-component="Dialog" data-ui-part="close" {...props}>
      {children}
    </BaseClose>
  );
}
DialogClose.displayName = "Dialog.Close";
// ============================================================================
// Compound Component Export
// ============================================================================
const Dialog = Object.assign(DialogContent, {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
});
export {
  Dialog,
  DialogRoot,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
