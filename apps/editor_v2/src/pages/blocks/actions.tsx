import { ArrowSquareRight, CursorClick, Plus } from "@phosphor-icons/react";
import { isPageDirective } from "@govtech-bb/govbbmarkd";
import { $createTextNode } from "lexical";
import { useState } from "react";
import { useLinkPages } from "../../editor/react/composer";
import { defineSlot } from "../../editor/react/contributions";
import { linkAddress } from "../../editor/modules/links/url";
import { Button } from "../../ui/button";
import { Field } from "../../ui/field";
import { Input } from "../../ui/input";
import { LinkPicker } from "../../ui/link-picker";
import { NativeSelect } from "../../ui/native-select";
import { pageInsertAction } from "../insertion";
import { phrasing } from "../markdown";
import { safePageUrl } from "../modules/text";
import {
  BlockMenuItem,
  BlockSettings,
  updateAttributes,
  type BlockOptionsProps,
} from "./block-options";
import { PageButtonLink } from "./button-link";
import { $parseDirective, defineBlock, directive } from "./define-block";
import { PageComponentNode, type PageComponentAttributes } from "./node";
import "./buttons.css";

declare module "./node" {
  interface PageComponentKinds {
    actions: true;
    action: true;
  }
}

/** Where a button goes, on its editing surface, and its style; Start markers share it (see ./start-link). */
export function decorateButton(element: HTMLElement, attributes: PageComponentAttributes) {
  element.dataset.destination = attributes.href ?? attributes.form ?? "Linked form";
  element.classList.toggle("page-action-secondary", attributes.variant === "secondary");
}

/** Action target fields are applied together; legacy Start destinations stay at the caret. */
function ButtonSettings({ component, change }: BlockOptionsProps) {
  const data = component.attributes;
  const [href, setHref] = useState(data.href ?? "");
  const [form, setForm] = useState(data.form ?? "");

  const [target, setTarget] = useState<"url" | "form" | "linked-form">(
    data.form !== undefined ? "form" : data.href !== undefined ? "url" : "linked-form",
  );

  const [error, setError] = useState<string>();
  const pages = useLinkPages();

  const keep = () => {
    const destination = target === "url" ? linkAddress(href, safePageUrl) : undefined;

    if (destination === null) {
      setError("Enter a relative link, or an http, https, email or telephone link.");

      return;
    }

    updateAttributes(change, {
      href: destination,
      form: target === "form" ? form : undefined,
      target: target === "linked-form" ? "form" : undefined,
    });

    if (destination) setHref(destination);
    setError(undefined);
  };

  return (
    <BlockSettings onKeep={keep}>
      <Field size="sm" label="Destination type">
        <NativeSelect
          size="sm"
          value={target}
          onChange={(event) => {
            const value = event.target.value;

            if (value === "url" || value === "form" || value === "linked-form") setTarget(value);
          }}
        >
          <option value="url">Link</option>
          <option value="linked-form">Page’s linked form</option>
          <option value="form">Registered form</option>
        </NativeSelect>
      </Field>
      {target === "url" && (
        <Field size="sm" label="Button destination">
          <LinkPicker size="sm" value={href} pages={pages} onValueChange={setHref} />
        </Field>
      )}
      {target === "form" && (
        <Field size="sm" label="Form identifier">
          <Input
            size="sm"
            value={form}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
            title="Use letters, numbers, hyphens or underscores; start with a letter or number."
            onChange={(event) => setForm(event.target.value)}
          />
        </Field>
      )}
      <Field size="sm" label="Button style">
        <NativeSelect
          size="sm"
          value={data.variant ?? "primary"}
          onChange={(event) => updateAttributes(change, { variant: event.target.value })}
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
        </NativeSelect>
      </Field>
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="justify-self-start">
        Apply settings
      </Button>
    </BlockSettings>
  );
}

function AddButton({ change }: BlockOptionsProps) {
  return (
    <BlockMenuItem
      icon={<Plus />}
      onClick={() =>
        change((node) => {
          const button = new PageComponentNode("action", {
            href: "#",
            variant: "secondary",
          }).append($createTextNode("Get help"));

          if (node.getKind() === "actions") node.append(button);
          else node.insertAfter(button);
          button.selectStart();
        })
      }
    >
      Add another button
    </BlockMenuItem>
  );
}

/** `::::actions` of `:::action` buttons, and a button on its own, such as Start now linking the page's form. */
export const actions = defineBlock({
  key: "page-actions",
  kinds: [
    { kind: "actions", traits: ["buttons"] },
    { kind: "action", shadowRoot: false, traits: ["button"], decorate: decorateButton },
  ],
  markdown: [
    directive("actions"),
    {
      // Fenced, or the single-line ::action[Label]{href="/next"}
      accepts: (node) => isPageDirective(node) && node.name === "action",
      owns: (node) => node instanceof PageComponentNode && node.getKind() === "action",
      $import(node, context) {
        const { label, target, variant } = $parseDirective(node, "action");
        const attributes: PageComponentAttributes = {};

        if (variant === "secondary") attributes.variant = "secondary";

        if (target.kind === "url") attributes.href = target.href;
        else if (target.kind === "form") attributes.form = target.formId;
        else attributes.target = "form";

        return [
          new PageComponentNode("action", attributes).append(
            ...label.flatMap((child) => context.$import(child)),
          ),
        ];
      },
      $export(node, context) {
        if (!(node instanceof PageComponentNode)) throw new Error("Expected a button");
        const data = node.getAttributes();

        return [
          {
            type: "containerDirective",
            name: "action",
            attributes: {
              href: data.href,
              form: data.form,
              target: data.target,
              variant: data.variant,
            },
            children: [
              {
                type: "paragraph",
                children: phrasing(node.getChildren().flatMap((child) => context.$export(child))),
              },
            ],
          },
        ];
      },
    },
  ],
  insert: [
    pageInsertAction(
      "page-actions",
      "Action buttons",
      () =>
        new PageComponentNode("actions").append(
          new PageComponentNode("action", { href: "#" }).append($createTextNode("Continue")),
        ),
      {
        group: "Components",
        order: 40,
        icon: <CursorClick />,
        description: "Link to the next step or related pages.",
        aliases: ["button", "link button"],
      },
    ),
    pageInsertAction(
      "page-start",
      "Start button",
      () =>
        new PageComponentNode("action", { target: "form" }).append($createTextNode("Start now")),
      {
        group: "Components",
        order: 40,
        icon: <ArrowSquareRight />,
        description: "Take readers to the linked form.",
        aliases: ["start now", "apply", "call to action"],
      },
    ),
  ],
  options: [
    { kinds: ["action"], Options: ButtonSettings },
    { kinds: ["actions", "action"], Options: AddButton },
  ],
  slots: [defineSlot("page-button-link", "editor.overlay", () => <PageButtonLink />)],
});
