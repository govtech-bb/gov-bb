import { useEditorDefinition } from "../../editor/react/composer";
import { formDefinition } from "../definition";

function KindIcon({ kind, list }: { kind: string; list: boolean }) {
  const definition = formDefinition(useEditorDefinition());

  const content = definition.contents.find(
    (content) =>
      content.kind === kind ||
      content.source.storage.value === kind ||
      content.source.storage.type === kind,
  );

  return (
    (list
      ? content?.icon
      : (definition.fields.find((field) => field.kind === kind)?.icon ?? content?.icon)) ?? null
  );
}

/** Resolve icons in the mounted editor, including custom installed fields and content. */
export const kindIcon = (kind: string, list = false) => <KindIcon kind={kind} list={list} />;
