import {
  FormStructureModule,
  FormIdentityModule,
  PagesModule,
  RepetitionModule,
  ConditionalLogicModule,
  CalculationsModule,
  MentionsModule,
  $isPlainText,
  paragraphContent,
  headingContents,
  listContents,
  calloutContents,
  disclosureContent,
  textEntries,
  headingEntries,
  listEntries,
  calloutEntries,
  disclosureEntries,
  HeadingsModule,
  ListsModule,
  CalloutsModule,
  DisclosureModule,
  formFields,
} from "../forms/modules";
import { FormattingModule, LinksModule, TextModule } from "@/editor/modules";
import {
  createFormDraftCodec,
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
  ...formFields,
];

export const govbbFormEditor = defineFormEditor({ modules: govbbFormModules });

export const govbbFormRuntime = createFormRuntime(govbbFormEditor);

export const govbbFormCodec = createFormDraftCodec(govbbFormRuntime);
