import { expect, test } from "vitest";
import {
  govbbBox,
  govbbButton,
  govbbCheckbox,
  govbbRadio,
  govbbSecondaryButton,
  govbbSelect,
} from "./govbb";

const classes = (drawing: string) => drawing.split(" ");

test("GovBB's answers share its one frame, and a radio is a checkbox's marker made round", () => {
  expect(classes(govbbSelect)).toEqual(expect.arrayContaining(classes(govbbBox)));
  expect(classes(govbbRadio)).toEqual([...classes(govbbCheckbox), "rounded-full"]);
});

test("a secondary button is GovBB's button in other colours, as on a form so on a page", () => {
  expect(classes(govbbSecondaryButton)).toEqual([govbbButton, "govbb-button-secondary"]);
});
