import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Fieldset } from "@base-ui/react/fieldset";
import { createContext, forwardRef, useContext, type ReactNode } from "react";
import { Field, type FieldContentProps } from "../field/field";
import { cn } from "../utils/cn";

export type SwitchSize = "sm" | "base" | "lg";
export type SwitchVariant = "default" | "neutral";
export type SwitchProps = Omit<
  BaseSwitch.Root.Props,
  "render" | "className" | "children"
> &
  FieldContentProps & {
    size?: SwitchSize;
    variant?: SwitchVariant;
    className?: string;
    controlFirst?: boolean;
    transitioning?: boolean;
  };
export type SwitchItemProps = SwitchProps & { label: ReactNode };
export type SwitchLegendProps = { children: ReactNode; className?: string };
export type SwitchGroupProps = SwitchLegendProps & {
  legend?: ReactNode;
  error?: string;
  description?: ReactNode;
  disabled?: boolean;
  controlFirst?: boolean;
};

const ControlFirstContext = createContext(true);
const SwitchControl = forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    {
      className,
      size = "base",
      variant = "default",
      label,
      labelTooltip,
      description,
      error,
      controlFirst: controlFirstProp,
      transitioning,
      ...props
    },
    ref,
  ) {
    const inheritedControlFirst = useContext(ControlFirstContext);
    const control = (
      <BaseSwitch.Root
        {...props}
        ref={ref}
        nativeButton
        render={<button type="button" />}
        data-ui-component="Switch"
        data-size={size}
        data-variant={variant}
        aria-busy={transitioning || undefined}
        className={cn("ui-switch", className)}
      >
        <BaseSwitch.Thumb className="ui-switch-thumb" />
      </BaseSwitch.Root>
    );
    return label != null || description || error ? (
      <Field
        label={label}
        required={props.required}
        labelTooltip={labelTooltip}
        description={description}
        error={error}
        controlFirst={controlFirstProp ?? inheritedControlFirst}
      >
        {control}
      </Field>
    ) : (
      control
    );
  },
);

function SwitchLegend({ children, className }: SwitchLegendProps) {
  return (
    <Fieldset.Legend
      className={cn("text-base font-medium text-ui-default", className)}
    >
      {children}
    </Fieldset.Legend>
  );
}

function SwitchGroup({
  children,
  legend,
  description,
  error,
  disabled,
  controlFirst = true,
  className,
}: SwitchGroupProps) {
  return (
    <ControlFirstContext.Provider value={controlFirst}>
      <Fieldset.Root
        disabled={disabled}
        className={cn("grid gap-3", className)}
      >
        {legend && <SwitchLegend>{legend}</SwitchLegend>}
        {children}
        {description && <p className="text-sm text-ui-subtle">{description}</p>}
        {error && <p className="text-sm text-ui-danger">{error}</p>}
      </Fieldset.Root>
    </ControlFirstContext.Provider>
  );
}

export const Switch = Object.assign(SwitchControl, {
  Item: SwitchControl,
  Group: SwitchGroup,
  Legend: SwitchLegend,
});
