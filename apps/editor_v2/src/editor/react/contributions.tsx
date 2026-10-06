import { createElement, Fragment, type ComponentType } from "react";
import type { EditorRenderer, EditorSlotContribution } from "../core/contributions";
import { useEditorDefinition } from "./composer";

/** Type-check contribution props before erasing them at the shared registry boundary. */
export function defineRenderer<Props extends object>(
  key: string,
  Component: ComponentType<Props>,
): EditorRenderer {
  // SAFETY: Module authors pair this key with the same props at RendererHost/EditorSlot.
  // The heterogeneous registry erases that pairing; it does not accept serialized input.
  return { key, render: (props) => createElement(Component, props as Props) };
}

export function defineSlot<Props extends object>(
  key: string,
  slot: string,
  Component: ComponentType<Props>,
): EditorSlotContribution {
  return { ...defineRenderer(key, Component), slot };
}

export function RendererHost<Props extends object>({
  name,
  props,
}: {
  name: string;
  props: Props;
}) {
  const renderer = useEditorDefinition().renderers.find((item) => item.key === name);

  if (!renderer) throw new Error(`No renderer installed: ${name}`);

  return renderer.render(props);
}

export function EditorSlot<Props extends object>({ name, props }: { name: string; props: Props }) {
  return useEditorDefinition().slots.flatMap((item) =>
    item.slot === name ? [<Fragment key={item.key}>{item.render(props)}</Fragment>] : [],
  );
}
