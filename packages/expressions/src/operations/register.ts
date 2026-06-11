import type jsonLogicType from "json-logic-js";
import { age } from "./age";
import { today } from "./today";
import { daysBetween } from "./days-between";
import { currency } from "./currency";
import { schoolEmail } from "./school-email";

export function registerOperations(jsonLogic: typeof jsonLogicType): void {
  jsonLogic.add_operation("age", age);
  jsonLogic.add_operation("today", today);
  jsonLogic.add_operation("daysBetween", daysBetween);
  jsonLogic.add_operation("currency", currency);
  jsonLogic.add_operation("schoolEmail", schoolEmail);
}
