import {
  AirplaneTilt,
  Backpack,
  Bank,
  Cake,
  Coins,
  Flag,
  GenderIntersex,
  Globe,
  Heart,
  House,
  IdentificationBadge,
  IdentificationCard,
  Mailbox,
  MapPin,
  MapTrifold,
  Student,
  User,
  UserCircle,
  Users,
  UserSquare,
} from "@phosphor-icons/react";
import { defineFormRegistry, defineFormRegistryEntry } from "../../forms/registry/definition";
import { group, rule } from "../../forms/registry/builders";
import { componentQuestion } from "./questions";
import { demoFormEntry } from "./demo";

const addressCountryBlocks = group(
  componentQuestion("components/address", "address"),
  componentQuestion("components/address", "address-line-2", {
    label: "Address line 2",
    required: false,
  }),
  componentQuestion("components/country", "country"),
  componentQuestion("components/parish", "parish", {
    visible: false,
    layout: { under: { question: "country", option: "barbados" } },
  }),
  componentQuestion("components/postcode", "postcode", {
    visible: false,
    layout: { under: { question: "country", option: "barbados" } },
  }),
  rule({
    id: "barbados-address-rule",
    rules: [
      {
        id: "show-barbados-address",
        when: { op: "selected", question: "country", option: "barbados" },
        actions: [{ type: "setVisible", targets: ["parish", "postcode"], value: true }],
      },
    ],
  }),
);

export const nationalIdEntry = defineFormRegistryEntry({
  scope: "fragment",
  key: "GOVBB_NATIONAL_ID",
  version: 1,
  title: "National ID number",
  icon: <IdentificationCard />,
  keywords: "nid, identification, id card govbb",
  description:
    "Most people’s main identifier. The box takes digits only and adds the hyphen (999999-9999); the hint text points people to their National Registration card.",
  blocks: group(componentQuestion("components/national-id-number", "national-id-number")),
});

export const addressCountryEntry = defineFormRegistryEntry({
  scope: "fragment",
  key: "GOVBB_ADDRESS_COUNTRY",
  version: 1,
  title: "Address with country",
  icon: <MapTrifold />,
  keywords: "street, home, abroad, overseas govbb",
  description:
    "A reusable group of two address lines and country, with parish and postcode shown when Barbados is selected. Edit the inserted questions and conditions for this form.",
  // The existing shortcut ends at its visible rule, without an extra empty content block.
  trailingParagraph: false,
  blocks: addressCountryBlocks,
});

/** Add a developer entry here to make it available in the Form registry. */
export const govbbFormRegistryEntries = [
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_ADDRESS_LOOKUP",
    version: 1,
    title: "Address lookup",
    icon: <MapPin />,
    keywords: "address, search govbb",
    description: "People search for an address and submit it as a single text answer.",
    blocks: group(componentQuestion("components/address-lookup", "address-lookup")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_OPENING_HOURS",
    version: 1,
    title: "Opening hours",
    icon: <House />,
    keywords: "hours, weekly, business govbb",
    description: "People enter opening and closing times for each day they are open.",
    blocks: group(componentQuestion("components/opening-hours", "opening-hours")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_NAME",
    version: 1,
    title: "First, middle and last name",
    icon: <User />,
    keywords: "name, given name, surname govbb",
    description:
      "A reusable group of first name, middle name(s) and last name questions. Delete any question the service does not need.",
    blocks: group(
      componentQuestion("components/first-name", "first-name"),
      componentQuestion("components/middle-name", "middle-name"),
      componentQuestion("components/last-name", "last-name"),
    ),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_FULL_NAME",
    version: 1,
    title: "Full name",
    icon: <UserCircle />,
    keywords: "name govbb",
    description:
      "People type their whole name in one box. Enough to address someone; to match them against a record, use First, middle and last name.",
    blocks: group(componentQuestion("components/name", "name")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_TITLE",
    version: 1,
    title: "Title (Mr, Ms, Dr)",
    icon: <UserSquare />,
    keywords: "mr, mrs, miss, ms, dr govbb",
    description:
      "People pick Mr, Miss, Ms, Mrs or Dr. Only ask for a title when a record needs one: many services don’t.",
    blocks: group(componentQuestion("components/title", "title")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_DATE_OF_BIRTH",
    version: 1,
    title: "Date of birth",
    icon: <Cake />,
    keywords: "dob, birthday, age govbb",
    description:
      "People type the day, month and year they were born, which must be in the past. Set a Min age in the block menu if the service has an age limit.",
    blocks: group(componentQuestion("components/date-of-birth", "date-of-birth")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_SEX",
    version: 1,
    title: "Sex",
    icon: <GenderIntersex />,
    keywords: "gender govbb",
    description: "People choose Male or Female. Only ask when the service needs to know.",
    blocks: group(componentQuestion("components/sex", "sex")),
  }),
  nationalIdEntry,
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_NATIONAL_INSURANCE",
    version: 1,
    title: "National Insurance number",
    icon: <IdentificationBadge />,
    keywords: "nis govbb",
    description:
      "People type their 6-digit National Insurance (NIS) number. The box takes digits only.",
    blocks: group(
      componentQuestion("components/national-insurance-number", "national-insurance-number"),
    ),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_PASSPORT",
    version: 1,
    title: "Passport number",
    icon: <AirplaneTilt />,
    keywords: "travel govbb",
    description:
      "For people without a National ID number: offer it instead of the ID, not as well as it. At least 6 characters.",
    blocks: group(componentQuestion("components/passport-number", "passport-number")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_TAMIS",
    version: 1,
    title: "TAMIS number",
    icon: <Coins />,
    keywords: "tax govbb",
    description: "People type their TAMIS (tax) number: 10 to 15 digits.",
    blocks: group(componentQuestion("components/tamis-number", "tamis-number")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_ADDRESS",
    version: 1,
    title: "Barbados address",
    icon: <House />,
    keywords: "street, home govbb",
    description:
      "A reusable group of two address lines, parish and postcode. Line 2 and postcode start optional. Edit each question for this form.",
    blocks: group(
      componentQuestion("components/address", "address"),
      componentQuestion("components/address", "address-line-2", {
        label: "Address line 2",
        required: false,
      }),
      componentQuestion("components/parish", "parish"),
      componentQuestion("components/postcode", "postcode"),
    ),
  }),
  addressCountryEntry,
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_PARISH",
    version: 1,
    title: "Parish",
    icon: <MapPin />,
    keywords: "govbb",
    description:
      "People pick one of the 11 parishes. Ask for the parish on its own when you don’t need a whole address.",
    blocks: group(componentQuestion("components/parish", "parish")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_POSTCODE",
    version: 1,
    title: "Postcode",
    icon: <Mailbox />,
    keywords: "post code, zip govbb",
    description:
      "A Barbados postcode, like BB17004, in a short box; The form checks the format. It starts optional: only require it if the service can’t work without it.",
    blocks: group(componentQuestion("components/postcode", "postcode")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_COUNTRY",
    version: 1,
    title: "Country",
    icon: <Globe />,
    keywords: "govbb",
    description:
      "An editable copy of the team’s country list, with Barbados and the Caribbean first. Changes stay in this form.",
    blocks: group(componentQuestion("components/country", "country")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_NATIONALITY",
    version: 1,
    title: "Nationality",
    icon: <Flag />,
    keywords: "citizenship govbb",
    description:
      "An editable copy of the team’s nationality list, with Barbadian and Caribbean nationalities first. Changes stay in this form.",
    blocks: group(componentQuestion("components/nationality", "nationality")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_RELATIONSHIP",
    version: 1,
    title: "Relationship",
    icon: <Users />,
    keywords: "next of kin govbb",
    description:
      "An editable copy of the team’s relationship list, including spouse, parent and child.",
    blocks: group(componentQuestion("components/relationship", "relationship")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_MARITAL_STATUS",
    version: 1,
    title: "Marital status",
    icon: <Heart />,
    keywords: "married govbb",
    description:
      "People pick single, married or divorced. Only ask when the service needs to know.",
    blocks: group(componentQuestion("components/marital-status", "marital-status")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_PRIMARY_SCHOOL",
    version: 1,
    title: "Primary school",
    icon: <Backpack />,
    keywords: "school govbb",
    description: "An editable copy of the team’s primary school list for Barbados.",
    blocks: group(componentQuestion("components/primary-school", "primary-school")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_SECONDARY_SCHOOL",
    version: 1,
    title: "Secondary school",
    icon: <Student />,
    keywords: "school govbb",
    description: "An editable copy of the team’s secondary school list for Barbados.",
    blocks: group(componentQuestion("components/secondary-school", "secondary-school")),
  }),
  defineFormRegistryEntry({
    scope: "fragment",
    key: "GOVBB_ACCOUNT_TYPE",
    version: 1,
    title: "Account type",
    icon: <Bank />,
    keywords: "bank, savings govbb",
    description: "People pick checking, savings, business or joint for a bank account.",
    blocks: group(componentQuestion("components/account-type", "account-type")),
  }),
].map((entry) =>
  defineFormRegistryEntry({
    ...entry,
    foldedQuestions: entry.blocks
      .filter((block) => block.type === "question" && (block.options?.length ?? 0) > 20)
      .map((block) => block.id),
  }),
);

export const govbbFormRegistry = defineFormRegistry([...govbbFormRegistryEntries, demoFormEntry]);
