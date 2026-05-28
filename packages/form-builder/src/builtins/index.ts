import type { ComponentDefinition } from "../definition-types";
import type { BlockDefinition } from "../definition-types";

import { textComponent } from "./components/text";
import { emailComponent } from "./components/email";
import { numberComponent } from "./components/number";
import { dateComponent } from "./components/date";
import { telComponent } from "./components/tel";
import { selectComponent } from "./components/select";
import { radioComponent } from "./components/radio";
import { fileComponent } from "./components/file";
import { textareaComponent } from "./components/textarea";
import { checkboxComponent } from "./components/checkbox";
import { showHideComponent } from "./components/show-hide";

import { nameBlock } from "./blocks/name";
import { physicalAddressBlock } from "./blocks/physical-address";
import { dateOfBirthBlock } from "./blocks/date-of-birth";

export type { ComponentDefinition, BlockDefinition };

export const BUILTIN_COMPONENTS: ComponentDefinition[] = [
  textComponent,
  emailComponent,
  numberComponent,
  dateComponent,
  telComponent,
  selectComponent,
  radioComponent,
  fileComponent,
  textareaComponent,
  checkboxComponent,
  showHideComponent,
];

export const BUILTIN_BLOCKS: BlockDefinition[] = [
  nameBlock,
  physicalAddressBlock,
  dateOfBirthBlock,
];
