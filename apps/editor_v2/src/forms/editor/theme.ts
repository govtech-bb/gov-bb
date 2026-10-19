import { container, lineHint } from "../../editor/react/block-dom";

export const formTheme = {
  // An empty hint says what it's for, caret or not; the caret's empty line says how to add a block (lineHint)
  paragraph: `${container} ${lineHint} pt-1 pb-2 leading-[1.5] data-hint:pt-0 data-hint:pr-[calc(100%_-_var(--field-width,100%))] data-hint:text-muted data-hint:has-[>br:only-child]:before:content-["Hint_text"]!`,
};
