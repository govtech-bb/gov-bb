import { useConfirmation } from "../ui/dialog/confirmation";
import type { RecipeStepDraft } from "@govtech-bb/form-builder";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  GearSixIcon,
  LockSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Sidebar, useSidebar } from "../ui/sidebar";
import { ScrollArea } from "../ui/scroll-area";
import { DropdownMenu } from "../ui/dropdown";
import { isRequiredStep, REQUIRED_STEP_IDS } from "./recipe-reducer";

interface StepListProps {
  steps: RecipeStepDraft[];
  selectedStepId: string | null;
  onSelect: (stepId: string) => void;
  onAdd: () => void;
  onRemove: (stepId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  processorCount: number;
  isProcessorsActive: boolean;
  onSelectProcessors: () => void;
  hasContactDetails: boolean;
  isContactDetailsActive: boolean;
  onSelectContactDetails: () => void;
}

export function StepList(props: StepListProps) {
  const confirm = useConfirmation();
  const { setOpenMobile, isMobile } = useSidebar();
  const editableCount = props.steps.length - REQUIRED_STEP_IDS.length;

  function select(action: () => void) {
    action();
    setOpenMobile(false);
  }

  return (
    <Sidebar aria-label="Form outline">
      <Sidebar.Header className="flex-row items-center justify-between px-4 py-5">
        <h2 className="text-base font-semibold text-ui-strong">Form outline</h2>
        {isMobile && <Sidebar.Close />}
      </Sidebar.Header>
      <ScrollArea
        aria-label="Form navigation"
        className="min-h-0 flex-1"
        viewportClassName="scroll-fade"
      >
        <div className="space-y-6 px-3 pb-4">
          <Sidebar.Group>
            <Sidebar.GroupLabel>Steps</Sidebar.GroupLabel>
            <Sidebar.Menu>
              {props.steps.map((step, index) => {
                const required = isRequiredStep(step.stepId);
                return (
                  <Sidebar.MenuItem
                    key={step.stepId}
                    itemId={step.stepId}
                    className="group/step"
                  >
                    <Sidebar.MenuButton
                      active={step.stepId === props.selectedStepId}
                      aria-current={
                        step.stepId === props.selectedStepId
                          ? "step"
                          : undefined
                      }
                      onClick={() => select(() => props.onSelect(step.stepId))}
                      className="min-h-10 pe-9"
                      icon={
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-md bg-ui-recessed text-xs tabular-nums text-ui-subtle"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                      }
                    >
                      {step.title || step.stepId}
                    </Sidebar.MenuButton>
                    {required ? (
                      <LockSimpleIcon
                        aria-hidden="true"
                        className="pointer-events-none absolute end-2.5 top-3 size-3.5 text-ui-inactive"
                      />
                    ) : (
                      <DropdownMenu>
                        <DropdownMenu.Trigger
                          render={
                            <Button
                              variant="ghost"
                              shape="square"
                              size="sm"
                              className="absolute end-1 top-1.5"
                              aria-label={`Actions for ${step.title || step.stepId}`}
                              icon={<DotsThreeIcon aria-hidden="true" />}
                            />
                          }
                        />
                        <DropdownMenu.Content align="start" side="right">
                          <DropdownMenu.Item
                            disabled={index === 0}
                            onClick={() => props.onMoveUp(index)}
                          >
                            <ArrowUpIcon aria-hidden="true" />
                            Move up
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            disabled={index === editableCount - 1}
                            onClick={() => props.onMoveDown(index)}
                          >
                            <ArrowDownIcon aria-hidden="true" />
                            Move down
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item
                            className="text-ui-danger"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Delete step?",
                                  description: "Delete this step?",
                                  confirmLabel: "Delete step",
                                  destructive: true,
                                })
                              )
                                props.onRemove(step.stepId);
                            }}
                          >
                            <TrashIcon aria-hidden="true" />
                            Delete step
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    )}
                  </Sidebar.MenuItem>
                );
              })}
            </Sidebar.Menu>
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => select(props.onAdd)}
              icon={<PlusIcon aria-hidden="true" />}
            >
              Add Step
            </Button>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>Form</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                active={props.isContactDetailsActive}
                aria-current={props.isContactDetailsActive ? "true" : undefined}
                onClick={() => select(props.onSelectContactDetails)}
                icon={
                  <EnvelopeSimpleIcon
                    className="size-4 shrink-0 text-ui-subtle"
                    aria-hidden="true"
                  />
                }
              >
                {`Contact Details ${props.hasContactDetails ? "✓" : "(none)"}`}
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                active={props.isProcessorsActive}
                aria-current={props.isProcessorsActive ? "true" : undefined}
                onClick={() => select(props.onSelectProcessors)}
                icon={
                  <GearSixIcon
                    className="size-4 shrink-0 text-ui-subtle"
                    aria-hidden="true"
                  />
                }
              >
                {`Processors (${props.processorCount})`}
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
        </div>
      </ScrollArea>
      <Sidebar.Footer className="px-4 py-4 text-xs text-ui-subtle">
        GovTech Barbados
      </Sidebar.Footer>
    </Sidebar>
  );
}
