import {
  BooleanModule,
  FormStructureModule,
  FormIdentityModule,
  PagesModule,
  RepetitionModule,
  ConditionalLogicModule,
  CalculationsModule,
  MentionsModule,
  OpeningHoursModule,
  CheckboxAccordionModule,
  AddressLookupModule,
  MultipleChoiceModule,
  CheckboxesModule,
  DropdownModule,
  NumberModule,
  DateModule,
  TimeModule,
  $isPlainText,
  paragraphContent,
  headingContents,
  listContents,
  calloutContents,
  disclosureContent,
  PhoneModule,
  EmailModule,
  LongAnswerModule,
  ShortAnswerModule,
  FileUploadModule,
} from "../forms/modules";
import {
  textEntries,
  headingEntries,
  listEntries,
  calloutEntries,
  disclosureEntries,
  FormattingModule,
  HeadingsModule,
  ListsModule,
  CalloutsModule,
  DisclosureModule,
  LinksModule,
  TextModule,
} from "../editor";
import {
  createDraftCodec,
  createFormRuntime,
  formContentModule,
  defineFormEditor,
  FormRegistryModule,
  type FormModule,
} from "../forms";
import { govbbFormRegistry } from "./form-registry/entries";
import { RegistryEntryPreview } from "./form-registry/preview";
import { createElement } from "react";

export const govbbFormModules: readonly FormModule[] = [
  formContentModule(
    TextModule({ browser: false, initialize: false }),
    [paragraphContent],
    textEntries,
    3005,
  ),
  FormStructureModule(),
  RepetitionModule(),
  PagesModule(),
  FormIdentityModule(),
  FormRegistryModule(govbbFormRegistry, {
    preview: (entry) => createElement(RegistryEntryPreview, { entry }),
  }),
  formContentModule(
    HeadingsModule({ browser: false, actions: false }),
    headingContents,
    headingEntries,
    3008,
  ),
  formContentModule(
    ListsModule({ browser: false, actions: false }),
    listContents,
    listEntries,
    3006,
  ),
  formContentModule(
    CalloutsModule({ browser: false, actions: false }),
    calloutContents,
    calloutEntries,
    3013,
  ),
  formContentModule(
    DisclosureModule({ browser: false, actions: false }),
    [disclosureContent],
    disclosureEntries,
    3012,
  ),
  LinksModule(),
  FormattingModule({ isPlainText: $isPlainText }),
  ConditionalLogicModule(),
  CalculationsModule(),
  MentionsModule(),
  ShortAnswerModule(),
  BooleanModule(),
  FileUploadModule(),
  LongAnswerModule(),
  EmailModule(),
  PhoneModule(),
  NumberModule(),
  DateModule(),
  TimeModule(),
  MultipleChoiceModule(),
  CheckboxesModule(),
  DropdownModule(),
  AddressLookupModule(),
  OpeningHoursModule(),
  CheckboxAccordionModule(),
];

export const govbbFormEditor = defineFormEditor({ modules: govbbFormModules });

export const govbbFormRuntime = createFormRuntime(govbbFormEditor);

export const govbbFormCodec = createDraftCodec(govbbFormRuntime);
