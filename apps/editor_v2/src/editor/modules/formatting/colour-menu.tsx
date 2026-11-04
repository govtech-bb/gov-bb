import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CaretDown, Palette } from "@phosphor-icons/react";
import { HISTORY_PUSH_TAG } from "lexical";
import { cn } from "../../../cn";
import { Button } from "../../../ui/button";
import { Menu } from "../../../ui/menu";
import { Tip } from "../../../ui/tooltip";
import { keepSelection } from "./toolbar";

/** A colour the menu offers for text, with the class that draws its swatch. */
export type TextColour = {
  readonly value: string;
  readonly label: string;
  readonly swatch: string;
};

/**
 * An editor's colours for text: the selection's colour (null when it's mixed, undefined where it can't take one), and
 * giving it one. Its callbacks run in the editor's Lexical context.
 */
export type TextColours = {
  readonly choices: readonly TextColour[];
  readonly $value: () => string | null | undefined;
  readonly $colour: (value: string) => void;
};

/** The selection's colour, as a control a module adds to the selection toolbar (SELECTION_TOOLBAR). */
export function TextColourMenu({ colours }: { colours: TextColours }) {
  const [editor] = useLexicalComposerContext();
  const value = editor.getEditorState().read(() => colours.$value(), { editor });

  if (value === undefined) return null;

  // Each change of colour is a step of its own in the undo history
  const colour = (next: string) => {
    if (editor.isEditable()) editor.update(() => colours.$colour(next), { tag: HISTORY_PUSH_TAG });
  };

  return (
    <Menu.Root>
      <Tip content="Text colour">
        <Menu.Trigger
          render={
            <Button
              aria-label="Text colour"
              icon={<Palette />}
              iconEnd={<CaretDown />}
              onMouseDown={keepSelection}
              className="my-1"
            />
          }
        />
      </Tip>
      {/* Back to the text, with its selection, rather than the button */}
      <Menu.Content aria-label="Text colour" finalFocus={() => editor.focus()}>
        <Menu.RadioGroup value={value} onValueChange={(next: string) => colour(next)}>
          {colours.choices.map((choice) => (
            <Menu.RadioItem
              key={choice.value}
              value={choice.value}
              icon={<span className={cn("size-4 rounded-sm border border-line", choice.swatch)} />}
              closeOnClick
            >
              {choice.label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}
