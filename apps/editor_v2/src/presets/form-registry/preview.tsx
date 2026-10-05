import type { FormRegistryEntry } from "../../forms/registry/definition";
import type { FormEditorDefinition } from "../../forms/definition";
import { formDefinition } from "../../forms/definition";
import { resolveNativeField } from "../../forms/native";
import type { RichText, QuestionBase } from "../../forms/schema";
import { useEditorDefinition } from "../../editor/react/composer";
import { cn } from "../../cn";
import { RendererHost } from "../../editor/react/contributions";

const text = (rich: RichText): string =>
  typeof rich === "string"
    ? rich
    : rich
        .map((item) =>
          typeof item === "string"
            ? item
            : "text" in item
              ? item.text
              : "link" in item
                ? text(item.content)
                : "break" in item
                  ? "\n"
                  : "",
        )
        .join("");

function hintText(hint: QuestionBase["hint"]): string {
  if (!hint) return "";

  if (typeof hint === "string") return hint;
  const first = hint[0];
  const separator = first && typeof first === "object" && "type" in first ? "\n" : "";

  return hint
    .map((part) => (typeof part === "object" && "type" in part ? text(part.content) : text([part])))
    .join(separator);
}

export function registryPreviewQuestions(
  entry: FormRegistryEntry,
  definition?: FormEditorDefinition,
) {
  const blocks = entry.scope === "form" ? entry.form.blocks : entry.blocks;

  return blocks.flatMap((block) => {
    if (block.type !== "question") return [];

    const configuration =
      block.config && typeof block.config === "object" ? block.config : undefined;

    const rawWidth = configuration && "width" in configuration ? configuration.width : undefined;

    const width =
      rawWidth === "short" || rawWidth === "medium" || rawWidth === "long" ? rawWidth : undefined;

    const mask =
      configuration && "mask" in configuration && typeof configuration.mask === "string"
        ? configuration.mask
        : undefined;

    const parent = block.layout?.under;

    const owner =
      parent && "question" in parent
        ? blocks.find((candidate) => candidate.id === parent.question)
        : undefined;

    const under =
      owner?.type === "question" && parent && "option" in parent
        ? owner.options?.find((option) => option.id === parent.option)?.label
        : undefined;

    const hint = hintText(block.hint);

    return [
      {
        key: block.id,
        label: text(block.label),
        under: under && text(under),
        hint: hint || undefined,
        kind: definition ? (resolveNativeField(block, definition)?.kind ?? block.kind) : block.kind,
        required: block.required?.value === true,
        width,
        mask,
        options: block.options?.slice(0, 3).map((option) => text(option.label)) ?? [],
        more: Math.max(0, (block.options?.length ?? 0) - 3),
      },
    ];
  });
}

/** The preview resolves the same native payload against the same installed modules as insertion. */
export function RegistryEntryPreview({ entry }: { entry: FormRegistryEntry }) {
  const definition = formDefinition(useEditorDefinition());

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
    >
      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
        {registryPreviewQuestions(entry, definition).map(
          ({ key, label, hint, kind, required, width, mask, options, more, under }) => (
            <div
              key={key}
              className={cn("not-first:mt-5", under && "ml-2.5 border-l-8 border-highlight pl-7")}
            >
              <div className="font-bold leading-[1.5]">
                {label}
                {!required && <span className="font-normal text-muted"> (optional)</span>}
              </div>
              {hint && <div className="leading-[1.5] text-muted">{hint}</div>}
              <div className="mt-2">
                <RendererHost
                  name={`field-preview:${kind}`}
                  props={{ width, mask, more, options }}
                />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
