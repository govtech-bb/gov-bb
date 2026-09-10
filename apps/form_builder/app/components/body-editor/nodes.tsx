import { Elevated } from "../ui/surface";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
import { InputArea } from "../ui/input/input-area";
import { Button } from "../ui/button";
import {
  isSafeContentUrl,
  serializeLandingComponent,
  serializeStartLinkMarker,
  type LandingAction,
  type LandingComponent,
} from "@govtech-bb/content/markdown-authoring";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getRoot,
  $createParagraphNode,
  $getDocument,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import {
  Add01Icon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  Delete02Icon,
} from "hugeicons-react";
import { useId } from "react";

function cloneComponent(component: LandingComponent): LandingComponent {
  if (component.kind !== "actions") return { ...component };
  return {
    kind: "actions",
    actions: component.actions.map((action) => ({ ...action })),
  };
}

function ensureDocumentHasParagraph(): void {
  const root = $getRoot();
  if (root.getChildrenSize() === 0) root.append($createParagraphNode());
}

function ComponentControls({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();

  const move = (direction: "up" | "down") => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!node) return;
      if (direction === "up") {
        node.getPreviousSibling()?.insertBefore(node);
      } else {
        node.getNextSibling()?.insertAfter(node);
      }
    });
  };

  const remove = () => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
      ensureDocumentHasParagraph();
    });
  };

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="group"
      aria-label="Component controls"
    >
      <Button
        type="button"
        aria-label="Move component up"
        onClick={() => move("up")}
        variant="ghost"
        size="sm"
        shape="square"
      >
        <ArrowUp02Icon size={16} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        aria-label="Move component down"
        onClick={() => move("down")}
        variant="ghost"
        size="sm"
        shape="square"
      >
        <ArrowDown02Icon size={16} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        aria-label="Remove component"
        onClick={remove}
        variant="destructive"
        size="sm"
      >
        <Delete02Icon size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

function LandingComponentEditor({
  component,
  nodeKey,
}: {
  component: LandingComponent;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const fieldId = useId();

  const update = (next: LandingComponent) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isLandingComponentNode(node)) node.setComponent(next);
    });
  };

  const updateAction = (index: number, patch: Partial<LandingAction>) => {
    if (component.kind !== "actions") return;
    update({
      kind: "actions",
      actions: component.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action,
      ),
    });
  };

  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      render={<section />}
      className="my-3 overflow-clip rounded-lg forced-colors:border-[CanvasText]"
      aria-label={`${component.kind} component`}
    >
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-ui-hairline bg-ui-recessed py-1.5 ps-3 pe-1.75">
        <strong className="text-[12.5px] tracking-normal">
          {component.kind === "notice"
            ? "Notice"
            : component.kind === "details"
              ? "Show / hide"
              : "Action group"}
        </strong>
        <ComponentControls nodeKey={nodeKey} />
      </header>

      <div className="grid gap-3 p-3">
        {component.kind === "notice" ? (
          <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
            <InputArea
              label={"Content"}
              id={`${fieldId}-body`}
              rows={3}
              value={component.body}
              onChange={(event) =>
                update({ kind: "notice", body: event.target.value })
              }
              className="w-full min-w-0"
            />
            <small>Markdown formatting is supported inside this notice.</small>
          </div>
        ) : component.kind === "details" ? (
          <>
            <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
              <Input
                label={"Summary"}
                id={`${fieldId}-summary`}
                type="text"
                value={component.summary}
                onChange={(event) =>
                  update({ ...component, summary: event.target.value })
                }
                className="w-full min-w-0"
              />
            </div>

            <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
              <InputArea
                label={"Content"}
                id={`${fieldId}-body`}
                rows={3}
                value={component.body}
                onChange={(event) =>
                  update({ ...component, body: event.target.value })
                }
                className="w-full min-w-0"
              />
              <small>
                Markdown formatting is supported inside this section.
              </small>
            </div>
          </>
        ) : (
          <>
            {component.actions.map((action, index) => {
              const hrefId = `${fieldId}-href-${index}`;
              const hrefInvalid = !isSafeContentUrl(action.href);
              return (
                <fieldset
                  className="m-0 grid min-w-0 grid-cols-[minmax(120px,0.8fr)_minmax(180px,1.4fr)_minmax(100px,0.55fr)_auto] items-end gap-2 rounded-md border border-ui-hairline p-2.5 @max-[680px]:grid-cols-1 [&_legend]:px-1 [&_legend]:text-[11px] [&_legend]:font-semibold [&_legend]:text-ui-default"
                  key={`${index}-${action.variant}`}
                >
                  <legend>Action {index + 1}</legend>
                  <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
                    <Input
                      label={"Label"}
                      type="text"
                      value={action.label}
                      onChange={(event) =>
                        updateAction(index, { label: event.target.value })
                      }
                      className="w-full min-w-0"
                    />
                  </div>
                  <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
                    <Input
                      label={"Link"}
                      id={hrefId}
                      type="text"
                      value={action.href}
                      aria-invalid={hrefInvalid || undefined}
                      aria-describedby={
                        hrefInvalid ? `${hrefId}-error` : undefined
                      }
                      onChange={(event) =>
                        updateAction(index, { href: event.target.value })
                      }
                      className="w-full min-w-0"
                    />
                    {hrefInvalid && (
                      <small id={`${hrefId}-error`} className="text-ui-danger">
                        Use a safe web, email, telephone, or relative link.
                      </small>
                    )}
                  </div>
                  <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
                    <Select
                      label={"Style"}
                      value={action.variant}
                      onValueChange={(nextValue) => {
                        if (nextValue === null) return;
                        updateAction(index, {
                          variant: nextValue as LandingAction["variant"],
                        });
                      }}
                      items={[
                        { value: "primary", label: "Primary" },
                        { value: "secondary", label: "Secondary" },
                      ]}
                    />
                  </div>
                  <Button
                    type="button"
                    aria-label={`Remove action ${index + 1}`}
                    disabled={component.actions.length === 1}
                    onClick={() =>
                      update({
                        kind: "actions",
                        actions: component.actions.filter(
                          (_action, actionIndex) => actionIndex !== index,
                        ),
                      })
                    }
                    variant="secondary-destructive"
                    size="sm"
                  >
                    <Delete02Icon size={15} aria-hidden="true" />
                    Remove
                  </Button>
                </fieldset>
              );
            })}

            <Button
              type="button"
              onClick={() =>
                update({
                  kind: "actions",
                  actions: [
                    ...component.actions,
                    {
                      label: "Another action",
                      href: "/",
                      variant: "secondary",
                    },
                  ],
                })
              }
              variant="outline"
              size="sm"
            >
              <Add01Icon size={15} aria-hidden="true" />
              Add action
            </Button>
          </>
        )}
      </div>
    </Elevated>
  );
}

type SerializedLandingComponentNode = Spread<
  {
    component: LandingComponent;
    type: "landing-component";
    version: 1;
  },
  SerializedDecoratorBlockNode
>;

export class LandingComponentNode extends DecoratorBlockNode {
  __component: LandingComponent;

  static getType(): string {
    return "landing-component";
  }

  static clone(node: LandingComponentNode): LandingComponentNode {
    return new LandingComponentNode(
      cloneComponent(node.__component),
      node.__format,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedLandingComponentNode) {
    return $createLandingComponentNode(serializedNode.component).updateFromJSON(
      serializedNode,
    );
  }

  constructor(
    component: LandingComponent,
    format = "" as ConstructorParameters<typeof DecoratorBlockNode>[0],
    key?: NodeKey,
  ) {
    super(format, key);
    this.__component = cloneComponent(component);
  }

  exportJSON(): SerializedLandingComponentNode {
    return {
      ...super.exportJSON(),
      component: cloneComponent(this.__component),
      type: "landing-component",
      version: 1,
    };
  }

  getComponent(): LandingComponent {
    return cloneComponent(this.getLatest().__component);
  }

  setComponent(component: LandingComponent): this {
    this.getWritable().__component = cloneComponent(component);
    return this;
  }

  getTextContent(): string {
    return serializeLandingComponent(this.getComponent());
  }

  decorate() {
    return (
      <LandingComponentEditor
        component={this.getComponent()}
        nodeKey={this.__key}
      />
    );
  }
}

export function $createLandingComponentNode(
  component: LandingComponent,
): LandingComponentNode {
  return $applyNodeReplacement(new LandingComponentNode(component));
}

export function $isLandingComponentNode(
  node: LexicalNode | null | undefined,
): node is LandingComponentNode {
  return node instanceof LandingComponentNode;
}

function StartLinkEditor({
  label,
  href,
  nodeKey,
}: {
  label: string;
  href: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const fieldId = useId();
  const hrefInvalid = Boolean(href) && !isSafeContentUrl(href);

  const update = (patch: { label?: string; href?: string }) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isStartLinkNode(node)) node.setValues(patch);
    });
  };

  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      render={<section />}
      className="my-3 overflow-clip rounded-lg forced-colors:border-[CanvasText]"
      aria-label="Start button"
    >
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-ui-hairline bg-ui-recessed py-1.5 ps-3 pe-1.75">
        <strong className="text-[12.5px] tracking-normal">Start button</strong>
        <ComponentControls nodeKey={nodeKey} />
      </header>
      <div className="grid gap-3 p-3">
        <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
          <Input
            label={"Label"}
            id={`${fieldId}-label`}
            type="text"
            value={label}
            onChange={(event) => update({ label: event.target.value })}
            className="w-full min-w-0"
          />
        </div>
        <div className="grid gap-1.25 text-[12px] font-semibold text-ui-default [&_textarea]:min-h-19 [&_textarea]:leading-[1.45] [:where(&)_small]:text-[11.5px] [:where(&)_small]:font-normal [:where(&)_small]:text-ui-default">
          <Input
            label={"Link override (optional)"}
            id={`${fieldId}-href`}
            type="text"
            value={href}
            aria-invalid={hrefInvalid || undefined}
            aria-describedby={hrefInvalid ? `${fieldId}-href-error` : undefined}
            onChange={(event) => update({ href: event.target.value })}
            className="w-full min-w-0"
          />
          <small
            id={hrefInvalid ? `${fieldId}-href-error` : undefined}
            className={hrefInvalid ? "text-ui-danger" : undefined}
          >
            {hrefInvalid
              ? "Use a safe web, email, telephone, or relative link."
              : "Leave blank to use the page’s configured destination."}
          </small>
        </div>
      </div>
    </Elevated>
  );
}

type SerializedStartLinkNode = Spread<
  {
    href: string;
    label: string;
    type: "start-link";
    version: 1;
  },
  SerializedDecoratorBlockNode
>;

export class StartLinkNode extends DecoratorBlockNode {
  __label: string;
  __href: string;

  static getType(): string {
    return "start-link";
  }

  static clone(node: StartLinkNode): StartLinkNode {
    return new StartLinkNode(
      node.__label,
      node.__href,
      node.__format,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedStartLinkNode) {
    return $createStartLinkNode(
      serializedNode.label,
      serializedNode.href,
    ).updateFromJSON(serializedNode);
  }

  constructor(
    label = "Start now",
    href = "",
    format = "" as ConstructorParameters<typeof DecoratorBlockNode>[0],
    key?: NodeKey,
  ) {
    super(format, key);
    this.__label = label;
    this.__href = href;
  }

  exportJSON(): SerializedStartLinkNode {
    return {
      ...super.exportJSON(),
      href: this.__href,
      label: this.__label,
      type: "start-link",
      version: 1,
    };
  }

  getValues(): { label: string; href: string } {
    const latest = this.getLatest();
    return { label: latest.__label, href: latest.__href };
  }

  setValues({ label, href }: { label?: string; href?: string }): this {
    const writable = this.getWritable();
    if (label !== undefined) writable.__label = label;
    if (href !== undefined) writable.__href = href;
    return this;
  }

  getTextContent(): string {
    return serializeStartLinkMarker(this.getValues());
  }

  decorate() {
    const { label, href } = this.getValues();
    return <StartLinkEditor label={label} href={href} nodeKey={this.__key} />;
  }
}

export function $createStartLinkNode(label = "Start now", href = "") {
  return $applyNodeReplacement(new StartLinkNode(label, href));
}

export function $isStartLinkNode(
  node: LexicalNode | null | undefined,
): node is StartLinkNode {
  return node instanceof StartLinkNode;
}

export class RawBreakNode extends DecoratorNode<null> {
  static getType(): string {
    return "raw-break";
  }

  static clone(node: RawBreakNode): RawBreakNode {
    return new RawBreakNode(node.__key);
  }

  static importJSON(_serializedNode: SerializedLexicalNode): RawBreakNode {
    return $createRawBreakNode();
  }

  exportJSON(): SerializedLexicalNode {
    return { ...super.exportJSON(), type: "raw-break", version: 1 };
  }

  createDOM(): HTMLElement {
    return $getDocument().createElement("br");
  }

  updateDOM(): false {
    return false;
  }

  decorate(): null {
    return null;
  }

  getTextContent(): string {
    return "<br />";
  }

  isInline(): true {
    return true;
  }
}

export function $createRawBreakNode(): RawBreakNode {
  return $applyNodeReplacement(new RawBreakNode());
}

export function $isRawBreakNode(
  node: LexicalNode | null | undefined,
): node is RawBreakNode {
  return node instanceof RawBreakNode;
}
