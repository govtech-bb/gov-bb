import { useConfirmation } from "../../components/ui/dialog/confirmation";
import { useState, type ReactNode } from "react";
import {
  CheckCircleIcon,
  FilePlusIcon,
  FolderOpenIcon,
  RocketLaunchIcon,
  ArrowCounterClockwiseIcon,
  EyeIcon,
} from "@phosphor-icons/react";
import type { RecipeVisibility } from "@govtech-bb/form-types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./-id-validation";

interface ToolbarProps {
  leading?: ReactNode;
  formId: string;
  title: string;
  idError?: string | null;
  isDirty: boolean;
  hasUnsavedChanges: boolean;
  isValidating: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  isPublishing: boolean;
  isReadOnly: boolean;
  lastSaveStatus: "idle" | "success" | "error" | "submitted";
  visibility: RecipeVisibility;
  onVisibilityChange: (visibility: RecipeVisibility) => void;
  onFormIdChange: (id: string) => void;
  onTitleChange: (title: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onSubmit: () => void;
  onPublish: () => void;
  onDiscard: () => void;
}

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "preview", label: "Preview" },
  { value: "draft", label: "Draft" },
  { value: "maintenance", label: "Maintenance" },
] satisfies { value: RecipeVisibility; label: string }[];

export function Toolbar(props: ToolbarProps) {
  const confirm = useConfirmation();
  const [formIdError, setFormIdError] = useState("");
  const shownFormIdError = formIdError || props.idError || "";
  const deployHint = props.isReadOnly
    ? "Another user is editing this form"
    : props.hasUnsavedChanges
      ? "Save draft before deploying"
      : props.visibility === "draft"
        ? "Set visibility to Preview or Public to deploy"
        : undefined;

  async function handleNew() {
    if (
      props.isDirty &&
      !(await confirm({
        title: "Discard unsaved changes?",
        description: "Unsaved changes will be lost. Continue?",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    props.onNew();
  }

  return (
    <header className="z-20 flex shrink-0 flex-col gap-4 border-b border-ui-hairline bg-ui-base px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {props.leading}
          <h1 className="sr-only text-base font-semibold text-ui-strong sm:not-sr-only">
            Form builder
          </h1>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Form actions"
        >
          <Button
            variant="ghost"
            shape="square"
            title="New form"
            aria-label="New"
            onClick={handleNew}
            icon={<FilePlusIcon aria-hidden="true" />}
          />
          <Button
            variant="ghost"
            shape="square"
            title="Open form"
            aria-label="Open"
            onClick={props.onOpen}
            icon={<FolderOpenIcon aria-hidden="true" />}
          />
          <span className="mx-1 h-5 w-px bg-ui-hairline" aria-hidden="true" />
          <Button
            variant="ghost"
            shape="square"
            title={props.isValidating ? "Validating…" : "Validate"}
            aria-label="Validate"
            loading={props.isValidating}
            onClick={props.onValidate}
            icon={<CheckCircleIcon aria-hidden="true" />}
          />
          <Button
            variant="ghost"
            shape="square"
            title={props.isPreviewing ? "Previewing…" : "Preview"}
            aria-label="Preview"
            loading={props.isPreviewing}
            onClick={props.onPreview}
            icon={<EyeIcon aria-hidden="true" />}
          />
          <Button
            variant="ghost"
            shape="square"
            title="Discard changes"
            aria-label="Discard"
            disabled={!props.hasUnsavedChanges}
            onClick={props.onDiscard}
            icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
          />
          <span className="mx-1 h-5 w-px bg-ui-hairline" aria-hidden="true" />
          <Button
            onClick={props.onSubmit}
            loading={props.isSubmitting}
            disabled={
              props.isValidating || !props.hasUnsavedChanges || props.isReadOnly
            }
            title={props.isReadOnly ? deployHint : undefined}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={props.onPublish}
            loading={props.isPublishing}
            disabled={
              props.isValidating ||
              props.hasUnsavedChanges ||
              props.isReadOnly ||
              props.visibility === "draft"
            }
            title={deployHint}
            icon={<RocketLaunchIcon aria-hidden="true" />}
          >
            Deploy
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-4 [&>:first-child]:col-span-2 sm:[&>:first-child]:col-span-1 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)_10rem]">
        <Input
          label="Title"
          name="title"
          placeholder="Untitled form"
          value={props.title}
          title={props.title || undefined}
          onChange={(event) => props.onTitleChange(event.target.value)}
          disabled={props.isReadOnly}
          className="w-full"
        />
        <Input
          label="Form ID"
          name="formId"
          placeholder="form-id"
          value={props.formId}
          title={props.formId || undefined}
          disabled={props.isReadOnly}
          error={shownFormIdError}
          className="w-full font-mono"
          onChange={(event) => {
            const raw = event.target.value.toLowerCase().replace(/\s+/g, "-");
            // Keep the controlled value editable even when its format is invalid.
            props.onFormIdChange(raw);
            setFormIdError(
              raw === ""
                ? "Form ID is required"
                : !KEBAB_ID_PATTERN.test(raw)
                  ? KEBAB_ID_ERROR
                  : "",
            );
          }}
        />
        <Select<RecipeVisibility>
          label="Visibility"
          name="visibility"
          value={props.visibility}
          items={VISIBILITY_OPTIONS}
          onValueChange={(value) => {
            if (value !== null) props.onVisibilityChange(value);
          }}
          disabled={props.isReadOnly}
        />
      </div>

      <div
        className="flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-subtle"
        role="status"
      >
        {props.hasUnsavedChanges && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full bg-ui-warning"
              aria-hidden="true"
            />
            Unsaved changes
          </span>
        )}
        {props.lastSaveStatus !== "idle" && (
          <span
            className={
              props.lastSaveStatus === "error"
                ? "text-ui-danger"
                : "text-ui-success"
            }
          >
            {props.lastSaveStatus === "success" && "✓ Valid"}
            {props.lastSaveStatus === "error" && "✗ Invalid"}
            {props.lastSaveStatus === "submitted" && "✓ Submitted"}
          </span>
        )}
        {deployHint && <span>{deployHint}</span>}
      </div>
    </header>
  );
}
