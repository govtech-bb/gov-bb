import { Collapsible } from "../ui/collapsible";
import { useConfirmation } from "../ui/dialog/confirmation";
import { useState, type ReactNode } from "react";
import {
  CheckCircleIcon,
  FilePlusIcon,
  FolderOpenIcon,
  DotsThreeIcon,
  ArrowCounterClockwiseIcon,
  EyeIcon,
  GearSixIcon,
} from "@phosphor-icons/react";
import type { RecipeVisibility } from "@govtech-bb/form-types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { DropdownMenu } from "../ui/dropdown";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./id-validation";

interface ToolbarProps {
  leading?: ReactNode;
  serviceScoped?: boolean;
  formId: string;
  title: string;
  idError?: string | null;
  isDirty: boolean;
  hasUnsavedChanges: boolean;
  isValidating: boolean;
  isPreviewing: boolean;
  previewLabel?: string;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const shownFormIdError = formIdError || props.idError || "";
  const deployHint = props.isReadOnly
    ? "Another user is editing this form"
    : props.hasUnsavedChanges
      ? "Save draft before publishing"
      : props.visibility === "draft"
        ? "Set visibility to Preview or Public in Form settings to publish"
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
    <header className="@container z-20 shrink-0 border-b border-ui-hairline bg-ui-base">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 @min-[48rem]:basis-0">
          {props.leading}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-ui-strong">
              {props.title || "Untitled form"}
            </h1>
            <div
              className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ui-subtle"
              role="status"
            >
              <span>Application form</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  props.lastSaveStatus === "error"
                    ? "text-ui-danger"
                    : undefined
                }
              >
                {props.hasUnsavedChanges
                  ? "Unsaved changes"
                  : props.lastSaveStatus === "submitted"
                    ? "Draft saved"
                    : "No changes to save"}
              </span>
              {props.lastSaveStatus === "success" && (
                <span className="text-ui-success">Checks passed</span>
              )}
              {props.lastSaveStatus === "error" && (
                <span className="text-ui-danger">Check form errors</span>
              )}
            </div>
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
          role="group"
          aria-label="Form actions"
        >
          <Button
            size="sm"
            variant="outline"
            onClick={props.onPreview}
            loading={props.isPreviewing}
            icon={<EyeIcon aria-hidden="true" />}
          >
            {props.previewLabel ?? "Preview"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={props.onSubmit}
            loading={props.isSubmitting}
            disabled={
              props.isValidating || !props.hasUnsavedChanges || props.isReadOnly
            }
          >
            Save draft
          </Button>
          <Button
            size="sm"
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
          >
            Publish
          </Button>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  aria-label="More form actions"
                  icon={<DotsThreeIcon aria-hidden="true" />}
                />
              }
            />
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item
                disabled={props.isValidating}
                onClick={props.onValidate}
              >
                <CheckCircleIcon aria-hidden="true" />
                Check form
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={props.onOpen}>
                <FolderOpenIcon aria-hidden="true" />
                {props.serviceScoped ? "Manage form" : "Open form"}
              </DropdownMenu.Item>
              {!props.serviceScoped && (
                <DropdownMenu.Item onClick={handleNew}>
                  <FilePlusIcon aria-hidden="true" />
                  New form
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                disabled={!props.hasUnsavedChanges || props.isReadOnly}
                onClick={props.onDiscard}
                className="text-ui-danger"
              >
                <ArrowCounterClockwiseIcon aria-hidden="true" />
                Discard changes
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
      </div>
      <Collapsible.Root
        className="border-t border-ui-hairline px-4 sm:px-6"
        open={settingsOpen || !!shownFormIdError}
        onOpenChange={setSettingsOpen}
      >
        <Collapsible.DefaultTrigger className="flex w-fit cursor-pointer items-center gap-2 rounded py-2.5 text-sm text-ui-subtle hover:text-ui-default focus-visible:outline-2 focus-visible:outline-ui-focus">
          <span className="inline-flex items-center gap-2">
            <GearSixIcon size={16} aria-hidden="true" />
            Form settings
            <span className="ms-1 text-xs">
              {
                VISIBILITY_OPTIONS.find(
                  (item) => item.value === props.visibility,
                )?.label
              }
            </span>
          </span>
        </Collapsible.DefaultTrigger>
        <Collapsible.Panel keepMounted>
          <div className="grid min-w-0 gap-4 pb-5 @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(10rem,18rem)_10rem]">
            <Input
              label="Title"
              name="title"
              placeholder="Untitled form"
              value={props.title}
              onChange={(event) => props.onTitleChange(event.target.value)}
              disabled={props.isReadOnly}
              className="w-full"
            />
            <Input
              label="Form ID"
              name="formId"
              placeholder="form-id"
              value={props.formId}
              disabled={props.isReadOnly || props.serviceScoped}
              error={shownFormIdError}
              className="w-full font-mono"
              onChange={(event) => {
                const raw = event.target.value
                  .toLowerCase()
                  .replace(/\s+/g, "-");
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
        </Collapsible.Panel>
      </Collapsible.Root>
      {deployHint && (
        <p className="px-4 pb-2 text-xs text-ui-subtle sm:px-6">{deployHint}</p>
      )}
    </header>
  );
}
