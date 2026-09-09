import {
  aiRecipeSchema,
  deserializeRecipe,
  serializeRecipeDraft,
  type RecipeDraft,
  type RegistryCatalog,
  type ValidationIssue,
} from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { validateRecipe } from "../../../server/registry";
import { recipeReducer } from "../../../routes/builder/-recipe-reducer";
import { Assistant } from "./assistant";

export function recipeSnapshot(draft: RecipeDraft): Record<string, unknown> {
  const {
    createdAt: _created,
    updatedAt: _updated,
    ...recipe
  } = serializeRecipeDraft(draft);
  return recipe;
}

export function prepareFormDraft(
  draft: RecipeDraft,
  recipe: unknown,
  catalog: RegistryCatalog,
  fixedId: boolean,
): RecipeDraft {
  const parsed = aiRecipeSchema.parse(recipe);
  const incoming = deserializeRecipe(parsed as ServiceContractRecipe, catalog);
  const steps = incoming.steps.map((step) => {
    const existing = draft.steps.find((item) => item.stepId === step.stepId);
    return {
      ...step,
      nextSteps: existing?.nextSteps,
      conditionalMarkdown: existing?.conditionalMarkdown,
    };
  });
  const counts = new Map<string, number>();
  const processors = incoming.processors
    ?.filter((processor) => processor.type !== "payment")
    .map((processor) => {
      const index = counts.get(processor.type) ?? 0;
      counts.set(processor.type, index + 1);
      const previous = draft.processors?.filter(
        (item) => item.type === processor.type,
      )[index];
      return {
        ...processor,
        config: preserveSecrets(processor.config, previous?.config),
      } as typeof processor;
    });
  return recipeReducer(draft, {
    type: "LOAD_DRAFT",
    draft: {
      ...draft,
      ...incoming,
      formId: fixedId ? draft.formId : incoming.formId,
      processors: processors
        ? [
            ...processors,
            ...(draft.processors?.filter(
              (processor) => processor.type === "payment",
            ) ?? []),
          ]
        : draft.processors,
      mdaContactId: draft.mdaContactId,
      meta: draft.meta,
      catchmentRouting: draft.catchmentRouting,
      steps,
    },
  });
}

function preserveSecrets(value: unknown, previous: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item, index) =>
      preserveSecrets(
        item,
        Array.isArray(previous) ? previous[index] : undefined,
      ),
    );
  if (!value || typeof value !== "object") return value;
  const before =
    previous && typeof previous === "object"
      ? (previous as Record<string, unknown>)
      : {};
  const after = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (
      /^(secret|token|accessToken|password|apiKey|authorization)$/i.test(key)
    ) {
      if (key in before) result[key] = before[key];
    } else if (key in after)
      result[key] = preserveSecrets(after[key], before[key]);
    else if (key === "auth" && key in before) result[key] = before[key];
  }
  return result;
}

export function FormAssistant({
  user,
  documentId,
  draft,
  catalog,
  readOnly,
  selection,
  onApply,
}: {
  user: string;
  documentId: string;
  draft: RecipeDraft;
  catalog: RegistryCatalog;
  readOnly: boolean;
  selection?: string;
  onApply: (draft: RecipeDraft, warnings: ValidationIssue[]) => void;
}) {
  return (
    <Assistant
      key={documentId}
      user={user}
      kind="form"
      documentId={documentId}
      document={recipeSnapshot(draft)}
      revisionSource={draft}
      selection={selection}
      readOnly={readOnly}
      prepare={async (proposal) => {
        const incoming = prepareFormDraft(
          draft,
          proposal.recipe,
          catalog,
          documentId !== "new",
        );
        const result = await validateRecipe({
          data: { recipe: serializeRecipeDraft(incoming) },
        });
        const issues = result.ok ? [] : result.issues;
        return {
          before: recipeSnapshot(draft),
          after: recipeSnapshot(incoming),
          warnings: issues.map(
            (issue) => (issue.path ? issue.path + ": " : "") + issue.message,
          ),
          apply: () => onApply(incoming, issues),
        };
      }}
    />
  );
}
