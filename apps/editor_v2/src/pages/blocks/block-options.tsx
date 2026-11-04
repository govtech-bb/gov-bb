import { useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { Field } from "../../ui/field";
import { Input } from "../../ui/input";
import { Menu } from "../../ui/menu";
import type { PageComponentAttributes, PageComponentKind, PageComponentNode } from "./node";

/** The slot Block options shows for the page component at the caret, or the block's own. */
export const BLOCK_OPTIONS = "page.block-options";

/** What Block options gives a component's options: the component, and a way to change it. */
export type BlockOptionsProps = {
  readonly component: {
    readonly key: string;
    readonly kind: PageComponentKind;
    readonly attributes: PageComponentAttributes;
  };
  /** A change is a step of its own in the undo history. Block options closes after it, unless `close` is false. */
  readonly change: (apply: (component: PageComponentNode) => void, close?: boolean) => void;
};

/** A block's options for some of its kinds of component, such as their settings or a row adding to them. */
export type BlockOption = {
  readonly kinds: readonly PageComponentKind[];
  readonly Options: ComponentType<BlockOptionsProps>;
};

/** A row of the block menu: it acts, then closes the menu itself, so a failure can stay in view. */
export function BlockMenuItem(props: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item closeOnClick={false} {...props} />;
}

/** A component's settings, kept when they're submitted. Keys typed in them stay out of the menu, Esc aside. */
export function BlockSettings({ onKeep, children }: { onKeep: () => void; children: ReactNode }) {
  return (
    <form
      className="page-component-settings grid gap-4 px-3.5 pt-1 pb-3"
      onKeyDown={(event) => event.key !== "Escape" && event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onKeep();
      }}
    >
      {children}
    </form>
  );
}

/** Changes some of a component's attributes, keeping Block options open. */
export const updateAttributes = (
  change: BlockOptionsProps["change"],
  patch: PageComponentAttributes,
) => change((node) => node.setAttributes({ ...node.getAttributes(), ...patch }), false);

/** A component's plain-text label, such as a Details summary, kept as its field loses the focus. */
export function LabelSettings({
  component,
  change,
  name,
  attribute,
}: BlockOptionsProps & { name: string; attribute: "summary" | "caption" | "summaryKey" }) {
  const current = component.attributes[attribute] ?? "";
  const [label, setLabel] = useState(current);
  const [error, setError] = useState<string>();

  const keep = () => {
    if (!label.trim()) {
      setError(`Enter a ${name.toLowerCase()}.`);

      return;
    }

    if (label !== current) {
      const patch: PageComponentAttributes = {};
      patch[attribute] = label;
      updateAttributes(change, patch);
    }

    setError(undefined);
  };

  return (
    <BlockSettings onKeep={keep}>
      <Field size="sm" label={name} error={error}>
        <Input
          size="sm"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={keep}
        />
      </Field>
    </BlockSettings>
  );
}
