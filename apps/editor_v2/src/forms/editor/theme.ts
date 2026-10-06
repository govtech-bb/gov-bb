import { container, ghost } from "../../editor/react/block-dom";

export const formTheme = {
  // An empty hint says what it's for, caret or not
  paragraph: `${container} ${ghost} pt-1 pb-2 leading-[1.5] data-hint:pt-0 data-hint:pr-[calc(100%_-_var(--field-width,100%))] data-hint:text-muted data-current:has-[>br:only-child]:before:content-["Type_'/'_to_insert_blocks"] data-hint:has-[>br:only-child]:before:content-["Hint_text"]!`,
};
