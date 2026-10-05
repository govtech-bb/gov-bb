import { EditorSlot } from "./contributions";
import { SlashMenu } from "./slash-menu";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import type { ComponentProps, ReactNode } from "react";
import { EditorComposer } from "./composer";

export function Editor({
  label,
  children,
  ...props
}: Omit<ComponentProps<typeof EditorComposer>, "children"> & {
  label: string;
  children?: ReactNode;
}) {
  return (
    <EditorComposer {...props}>
      <ContentEditable aria-label={label} />
      <SlashMenu />
      <EditorSlot name="editor.overlay" props={{}} />
      {children}
    </EditorComposer>
  );
}
