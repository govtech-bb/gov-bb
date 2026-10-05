import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  REDO_COMMAND,
  SKIP_DOM_SELECTION_TAG,
  UNDO_COMMAND,
} from "lexical";
import { registerEditorHistory } from "../../src/editor/core/history";
import { compileForm, preflight } from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { $formSettings, $setFormSettings } from "../../src/forms/editor/form-metadata";
import {
  answerPath,
  formSettingsIssues,
  serviceContract,
} from "../../src/forms/adapters/ssb/form-settings";
import {
  APPLICANT_LABEL,
  autoFormId,
  CONTACT_EMAIL,
  contactOut,
  DEPARTMENT_LABEL,
  EMAIL_PATTERN,
  FORM_SETTINGS,
  formSettingsOf,
  MDA_EMAIL,
  type FormSettings,
} from "../../src/forms/core/form-settings";
import { closingWorks } from "../../src/forms/core/closing";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $createFormTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
  $shareQuestionSettings,
  $turnInto,
  type QuestionNode,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { $setDepth, $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (e) => {
      throw e;
    },
  });

const $settle = () => {
  $ensureBlockIds($getRoot());
  $shareQuestionSettings($getRoot());
  $ensureQuestionFields($getRoot());
};

const run = (editor: ReturnType<typeof newEditor>, fn: () => void) =>
  editor.update(
    () => {
      fn();
      $settle();
    },
    { discrete: true },
  );

const department = {
  type: "email" as const,
  config: { recipientField: MDA_EMAIL, label: DEPARTMENT_LABEL },
};

function emailForm() {
  const editor = newEditor();

  let emailKey = "",
    titleKey = "",
    pageKey = "",
    question = "";

  run(editor, () => {
    const page = $setSettings($createWidgetNode("page-break"), { name: "Your details" });
    const title = $createQuestionNode().append($createTextNode("Email address"));
    const email = $setSettings($createInputNode("email"), { required: true });
    $getRoot().append(
      $createFormTitleNode().append($createTextNode("Permit application")),
      $createInputNode(),
      page,
      title,
      email,
    );
    $settle();
    question = $questionKey(email);
    $setFormSettings({ applicantEmail: { question } });
    emailKey = email.getKey();
    titleKey = title.getKey();
    pageKey = page.getKey();
  });

  return { editor, emailKey, titleKey, pageKey, question };
}

test("form IDs follow the title, with a fallback and a prefix for leading numbers", () => {
  expect(autoFormId("Apply for a permit to play loud music")).toBe(
    "apply-for-a-permit-to-play-loud-music",
  );
  expect(autoFormId("")).toBe("form");
  expect(autoFormId("2026 summer camp")).toBe("form-2026-summer-camp");
});

test("form settings readers discard invalid shapes and blank values without trimming kept text", () => {
  expect(
    formSettingsOf({
      formSettings: {
        formId: 3,
        description: "  ",
        visibility: "secret",
        contactDetails: { email: "a@b.bb", address: { line2: "Suite 2" } },
        departmentEmail: { off: "yes", to: "boss@x.bb" },
        applicantEmail: { subject: "Hi" },
      },
    }),
  ).toEqual({ contactDetails: { email: "a@b.bb", address: { line2: "Suite 2" } } });

  for (const value of [null, [], "settings", 3, true])
    expect(formSettingsOf({ formSettings: value })).toEqual({});

  const settings = formSettingsOf({
    formSettings: {
      formId: "permit",
      description: "  A permit application  ",
      visibility: "public",
      closingDateTime: "2026-07-09T23:59:00-04:00",
      contactDetails: {
        title: " Office ",
        telephoneNumber: " 555-0100 ",
        address: {
          line1: " Main Street ",
          line2: "  ",
          city: " Bridgetown ",
          country: " Barbados ",
        },
      },
      applicantEmail: { question: "email-question", subject: " Receipt " },
      departmentEmail: { off: true, to: CONTACT_EMAIL, subject: " Notification " },
    },
  });

  expect(settings.description).toBe("  A permit application  ");
  expect(settings.contactDetails).toEqual({
    title: " Office ",
    telephoneNumber: " 555-0100 ",
    address: { line1: " Main Street ", city: " Bridgetown ", country: " Barbados " },
  });
  expect(settings.applicantEmail).toEqual({ question: "email-question", subject: " Receipt " });
  expect(settings.departmentEmail).toEqual({
    off: true,
    to: CONTACT_EMAIL,
    subject: " Notification ",
  });
  expect(settings).toEqual(JSON.parse(JSON.stringify(settings)));
});

test("contact output trims text, omits blanks and retains missing required address parts", () => {
  expect(
    contactOut({ title: " Permits Office ", email: "", address: { line2: "Suite 2" } }),
  ).toEqual({ title: "Permits Office", address: { line1: "", line2: "Suite 2", city: "" } });
  expect(
    contactOut({
      title: " ",
      telephoneNumber: "",
      email: "\n",
      address: { line1: " ", line2: "", city: " ", country: "" },
    }),
  ).toBeUndefined();
  expect(contactOut()).toBeUndefined();
  expect(
    contactOut({
      title: " Office ",
      telephoneNumber: " 555-0100 ",
      email: " permits@example.gov.bb ",
      address: {
        line1: " Main Street ",
        line2: " Suite 2 ",
        city: " Bridgetown ",
        country: " Barbados ",
      },
    }),
  ).toEqual({
    title: "Office",
    telephoneNumber: "555-0100",
    email: "permits@example.gov.bb",
    address: { line1: "Main Street", line2: "Suite 2", city: "Bridgetown", country: "Barbados" },
  });
});

test("new service contracts include the department email and preview visibility", () => {
  expect(serviceContract({}, "Apply for a permit to play loud music", [])).toEqual({
    formId: "apply-for-a-permit-to-play-loud-music",
    processors: [department],
    meta: { visibility: "preview" },
  });

  const service = serviceContract(
    {
      description: " ",
      contactDetails: { title: " " },
      departmentEmail: { off: true },
      visibility: "maintenance",
    },
    "",
    [],
  );

  expect(service).toEqual({ formId: "form", processors: [], meta: { visibility: "maintenance" } });
});

test("service contracts trim authored text and keep SSB's key order", () => {
  const service = serviceContract(
    {
      formId: "permit",
      description: " Apply for a permit. ",
      contactDetails: { email: " permits@example.gov.bb " },
      applicantEmail: { question: "gone", subject: " Receipt " },
      departmentEmail: { to: CONTACT_EMAIL, subject: " Notification " },
      visibility: "public",
      closingDateTime: "2026-07-09T23:59:00-04:00",
    },
    "Permit",
    [],
  );

  expect(Object.keys(service)).toEqual([
    "formId",
    "description",
    "contactDetails",
    "processors",
    "meta",
  ]);
  expect(service.description).toBe("Apply for a permit.");
  expect(service.contactDetails).toEqual({ email: "permits@example.gov.bb" });
  expect(service.processors).toEqual([
    { type: "email", config: { recipientField: "", subject: "Receipt", label: APPLICANT_LABEL } },
    {
      type: "email",
      config: { recipientField: CONTACT_EMAIL, subject: "Notification", label: DEPARTMENT_LABEL },
    },
  ]);
  expect(Object.keys(service.processors[0]!.config)).toEqual([
    "recipientField",
    "subject",
    "label",
  ]);
  expect(service.meta).toEqual({
    visibility: "public",
    closingDateTime: "2026-07-09T23:59:00-04:00",
  });
});

test("closing dates require a valid timestamp with an explicit time zone", () => {
  const iso = "2026-07-09T23:59:00-04:00";
  expect(closingWorks(iso)).toBe(true);
  expect(closingWorks("2026-07-10T03:59:00Z")).toBe(true);

  for (const value of [
    "next Friday",
    "2026-07-09",
    "2026-07-09T23:59:00",
    "2026-99-99T23:59:00-04:00",
  ])
    expect(closingWorks(value)).toBe(false);
});

test("contact email validation matches SSB's email pattern", () => {
  for (const email of ["info@health.gov.bb", "permits@example.gov.bb"])
    expect(EMAIL_PATTERN.test(email)).toBe(true);

  for (const email of ["info@", "a..b@x.bb", "name@bb"])
    expect(EMAIL_PATTERN.test(email)).toBe(false);
});

test("the demo compiles form settings in SSB's order and passes preflight", () => {
  const editor = newEditor();
  run(editor, $demo);
  const schema = compileForm(editor.getEditorState());
  expect(Object.keys(schema)).toEqual([
    "formId",
    "title",
    "description",
    "contactDetails",
    "processors",
    "meta",
    "pages",
  ]);
  expect(schema.formId).toBe("apply-for-a-permit-to-play-loud-music");
  expect(schema.description).toBe("Apply for a permit to play amplified music at an event.");
  expect(schema.contactDetails).toEqual({
    title: "Permits Office",
    telephoneNumber: "+1 (246) 555-0100",
    email: "permits@example.gov.bb",
  });
  expect(schema.meta).toEqual({ visibility: "preview" });
  expect(schema.processors).toEqual([department]);
  expect(preflight(schema)).toEqual([]);
});

test("form ID pins clear back to the title's auto ID and leave no empty settings object", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode().append($createTextNode("Apply for a permit to play loud music")),
    ),
  );
  run(editor, () => $setFormSettings({ formId: "loud-music-permit" }));
  expect(compileForm(editor.getEditorState()).formId).toBe("loud-music-permit");
  run(editor, () => $setFormSettings({ formId: undefined }));
  expect(compileForm(editor.getEditorState()).formId).toBe("apply-for-a-permit-to-play-loud-music");
  editor.getEditorState().read(
    () => {
      expect($settings($getRoot().getFirstChild()!).formSettings).toBeUndefined();
    },
    { editor: editor },
  );
});

test("settings patches preserve page settings, replace nested objects and restore department choices", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append(
      $setSettings($createFormTitleNode(), {
        pageId: "details",
        button: "Next",
        repeatable: { min: 1, max: 5 },
      }),
    );
    $setFormSettings({
      contactDetails: { title: "Office", email: "permits@example.gov.bb" },
      departmentEmail: { to: CONTACT_EMAIL, subject: "Permit" },
    });
    $setFormSettings({ contactDetails: { email: "permits@example.gov.bb" } });
    expect($formSettings().contactDetails).toEqual({ email: "permits@example.gov.bb" });
    $setFormSettings({ departmentEmail: { ...$formSettings().departmentEmail, off: true } });
    expect($formSettings().departmentEmail).toEqual({
      off: true,
      to: CONTACT_EMAIL,
      subject: "Permit",
    });
    $setFormSettings({ departmentEmail: { ...$formSettings().departmentEmail, off: undefined } });
    expect($formSettings().departmentEmail).toEqual({ to: CONTACT_EMAIL, subject: "Permit" });
    expect($settings($getRoot().getFirstChild()!)).toMatchObject({
      pageId: "details",
      button: "Next",
      repeatable: { min: 1, max: 5 },
    });
  });
});

test("settings reads and writes do nothing without a form title", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append($createInputNode());
    $setFormSettings({ description: "No title" });
    expect($formSettings()).toEqual({});
    expect($settings($getRoot().getFirstChild()!).formSettings).toBeUndefined();
  });
});

test("the applicant email follows question and page IDs and trims its subject", () => {
  const { editor, emailKey, titleKey, pageKey, question } = emailForm();
  const recipient = () => compileForm(editor.getEditorState()).processors[0]!.config.recipientField;
  expect(compileForm(editor.getEditorState()).processors).toEqual([
    {
      type: "email",
      config: { recipientField: "your-details.email-address", label: APPLICANT_LABEL },
    },
    department,
  ]);
  expect(answerPath(compileForm(editor.getEditorState()).pages, question)).toBe(
    "your-details.email-address",
  );
  expect(answerPath(compileForm(editor.getEditorState()).pages, "missing")).toBeUndefined();
  run(editor, () =>
    $getNodeByKey<QuestionNode>(titleKey)!.clear().append($createTextNode("Your email")),
  );
  expect(recipient()).toBe("your-details.your-email");
  run(editor, () => $setSettings($getNodeByKey(emailKey)!, { fieldId: "contact-email" }));
  expect(recipient()).toBe("your-details.contact-email");
  run(editor, () => $setSettings($getNodeByKey(pageKey)!, { name: "Contact details" }));
  expect(recipient()).toBe("contact-details.contact-email");
  run(editor, () => {
    $setSettings($getNodeByKey(pageKey)!, { pageId: "contact" });
    $setFormSettings({ applicantEmail: { question, subject: "  Your permit application  " } });
  });
  expect(compileForm(editor.getEditorState()).processors[0]!.config).toEqual({
    recipientField: "contact.contact-email",
    subject: "Your permit application",
    label: APPLICANT_LABEL,
  });
});

for (const [change, message] of [
  ["deleted", "Choose the email question that gets the applicant’s email"],
  ["short answer", "The applicant’s email must go to an email address question"],
  ["repeating page", "The applicant’s email can’t go to a question people answer more than once"],
  ["repeated answer", "The applicant’s email can’t go to a question people answer more than once"],
] as const)
  test(`preflight catches an applicant email whose question is ${change}`, () => {
    const { editor, emailKey, pageKey } = emailForm();
    run(editor, () => {
      const email = $getNodeByKey(emailKey)!;

      if (change === "deleted") email.remove();

      if (change === "short answer") $turnInto(email, "text");

      if (change === "repeating page")
        $setSettings($getNodeByKey(pageKey)!, { repeatable: { min: 1, max: 5 } });

      if (change === "repeated answer") $setSettings(email, { fieldArray: { min: 1, max: 4 } });
    });
    const schema = compileForm(editor.getEditorState());

    if (change === "deleted") expect(schema.processors[0]!.config.recipientField).toBe("");
    expect(preflight(schema)).toContainEqual({
      code: "email-recipient",
      message,
      where: FORM_SETTINGS,
    });
  });

test("preflight reports invalid form metadata in stable order", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append($createFormTitleNode());
    $setSettings($getRoot().getFirstChild()!, {
      formSettings: {
        formId: "Bad ID",
        closingDateTime: "next Friday",
        contactDetails: { email: "permits@", address: { line2: "Suite 2" } },
        departmentEmail: { off: true },
      },
    });
  });
  const schema = compileForm(editor.getEditorState());
  Object.assign(schema.meta, { visibility: "secret" });
  expect(schema.processors).toEqual([]);
  expect(preflight(schema).map((issue) => issue.code)).toEqual([
    "no-confirmation",
    "no-declaration",
    "form-id",
    "visibility",
    "closing-date",
    "contact-email",
    "contact-address",
    "no-email",
  ]);
  expect(formSettingsIssues(schema)).toEqual([
    {
      code: "form-id",
      message: "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)",
      where: FORM_SETTINGS,
    },
    { code: "visibility", message: "Choose who can use the form", where: FORM_SETTINGS },
    {
      code: "closing-date",
      message: "Enter the closing date as a date and a time",
      where: FORM_SETTINGS,
    },
    {
      code: "contact-email",
      message: "Enter the contact email address in the correct format, like name@example.com",
      where: FORM_SETTINGS,
    },
    {
      code: "contact-address",
      message: "Enter address line 1 and the town or city, or clear the address",
      where: FORM_SETTINGS,
    },
    {
      code: "no-email",
      message: "Turn on at least one email: SSB needs every form to send one",
      where: FORM_SETTINGS,
    },
  ]);
});

test("a department email needs a contact address only when it sends there", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append($createFormTitleNode());
    $setFormSettings({ departmentEmail: { to: CONTACT_EMAIL } });
  });

  const issue = {
    code: "contact-recipient",
    message: "Add a contact email, or send the department’s email to its notification address",
    where: FORM_SETTINGS,
  };

  expect(preflight(compileForm(editor.getEditorState()))).toContainEqual(issue);
  run(editor, () => $setFormSettings({ contactDetails: { email: "permits@example.gov.bb" } }));
  expect(formSettingsIssues(compileForm(editor.getEditorState()))).toEqual([]);
  run(editor, () => $setFormSettings({ contactDetails: undefined, departmentEmail: undefined }));
  expect(formSettingsIssues(compileForm(editor.getEditorState()))).toEqual([]);
});

test("follow-up email recipients resolve to their page and field IDs", () => {
  const editor = newEditor();
  let key = "";
  run(editor, () => {
    const email = $setDepth($createInputNode("email"), 1);
    $getRoot().append(
      $setSettings($createFormTitleNode(), { pageId: "details" }),
      $createOptionNode().append($createTextNode("Send a receipt")),
      $setDepth($createQuestionNode().append($createTextNode("Email address")), 1),
      email,
    );
    $settle();
    key = $questionKey(email);
    $setFormSettings({ applicantEmail: { question: key } });
  });
  const schema = compileForm(editor.getEditorState());
  expect(answerPath(schema.pages, key)).toBe("details.email-address");
  expect(formSettingsIssues(schema)).toEqual([]);
});

test("form settings survive serialized editor state and undo with the editor's normal history", async () => {
  const editor = newEditor();
  run(editor, $demo);
  const before = compileForm(editor.getEditorState());
  const unregister = registerEditorHistory(editor);

  const patch: FormSettings = {
    description: " An edited description ",
    visibility: "public",
    departmentEmail: { to: CONTACT_EMAIL, subject: " Permit application " },
  };

  editor.update(() => $setFormSettings(patch), { tag: SKIP_DOM_SELECTION_TAG, discrete: true });
  const after = compileForm(editor.getEditorState());
  const restored = newEditor();
  restored.setEditorState(
    restored.parseEditorState(JSON.stringify(editor.getEditorState().toJSON())),
  );
  expect(compileForm(restored.getEditorState())).toEqual(after);
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await Promise.resolve();
  expect(compileForm(editor.getEditorState())).toEqual(before);
  editor.dispatchCommand(REDO_COMMAND, undefined);
  await Promise.resolve();
  expect(compileForm(editor.getEditorState())).toEqual(after);
  unregister();
});
