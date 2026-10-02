import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useConfirmation } from "../ui/dialog/confirmation";
import { previewRecipe } from "../../server/registry";
import {
  classifyRecipientField,
  type ServiceContract,
  type MdaContact,
  type ServiceSnapshot,
} from "@govtech-bb/form-types";
import { useMdaContacts } from "../builder/use-mda-contacts";
import { Collapsible } from "../ui/collapsible";
import { submissionActionSummary } from "../../lib/submission-actions";
import {
  mergeDbProcessors,
  extractDbProcessors,
  firstIncompletePaymentProcessor,
  type ResolvedFieldId,
} from "@govtech-bb/form-builder";
import { EMPTY_DRAFT, recipeReducer } from "../builder/recipe-reducer";
import { ProcessorsEditor } from "../builder/processors-editor";
import { servicePageLabel } from "./service-model";
import { z } from "zod";
import { LANDING_CATEGORIES } from "../../lib/content";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/input";
import { Select } from "../ui/select";
import { Field } from "../ui/field";
import { LayerCard } from "../ui/layer-card";
import { Banner } from "../ui/banner";
import { AppLink } from "../app-link";
import type { ServiceState } from "./service-state";

export type SetupSection = "details" | "delivery";

export function ServiceSetup({
  workspace,
  section,
  showActions = false,
}: {
  workspace: ServiceState;
  section: SetupSection;
  showActions?: boolean;
}) {
  const baseline = workspace.draft!;
  const [value, setValue] = useState<ServiceSnapshot>(baseline);
  const { contacts, loadError: directoryError } = useMdaContacts();
  const [saved, setSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirmation();
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: async () => {
      if (!dirty) return false;
      if (
        !(await confirm({
          title: "Save setup before leaving?",
          description:
            "Keep the contact details and delivery choices you entered.",
          confirmLabel: "Save and leave",
        }))
      )
        return true;
      return !(await workspace.save(value));
    },
  });
  const manifest = value.manifest;
  const change = (patch: Partial<typeof manifest>) =>
    setValue((v) => ({ ...v, manifest: { ...v.manifest, ...patch } }));
  const setContact = (
    key: "title" | "email" | "telephoneNumber",
    input: string,
  ) => {
    const details = { ...manifest.contactDetails, [key]: input || undefined };
    change({ contactDetails: details });
  };
  const save = async () => {
    if (
      firstIncompletePaymentProcessor(
        value.pendingConfig.processors?.map((p, i) => ({
          ...p,
          id: String(i),
        })),
      ) !== null
    ) {
      setActionError(
        "Complete the payment settings in Advanced action settings before saving.",
      );
      return;
    }
    setBusy(true);
    setActionError(null);
    setSaved(false);
    const snapshot: ServiceSnapshot = {
      ...value,
      manifest: {
        ...manifest,
        setup: {
          ...manifest.setup,
          ...(section === "delivery" && value.recipe
            ? {
                applicantEmail: value.recipe.processors?.some(isApplicantEmail)
                  ? "configured"
                  : "none",
                delivery:
                  value.recipe.processors?.some((p) => !isApplicantEmail(p)) ||
                  value.pendingConfig.processors?.length
                    ? "configured"
                    : "none",
              }
            : {}),
        },
      },
    };
    try {
      const result = await workspace.save(snapshot);
      if (result) {
        setValue(result);
        setSaved(true);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not save setup",
      );
    } finally {
      setBusy(false);
    }
  };
  const details = section === "details";
  return (
    <section
      aria-label={details ? "Service details" : "After submission settings"}
      className="mx-auto max-w-3xl"
    >
      <LayerCard>
        <LayerCard.Primary className="gap-6 p-6 sm:p-8">
          <div>
            <h2 tabIndex={-1} className="text-xl font-semibold">
              {details ? "Details" : "After submission"}
            </h2>
            <p className="mt-2 text-sm text-ui-subtle">
              {details
                ? "The name, category, public contact and release of this service."
                : "Choose who gets an email and what people see after sending their application."}
            </p>
          </div>
          {(workspace.error || actionError) && (
            <Banner variant="error" role="alert">
              {actionError ?? workspace.error}
            </Banner>
          )}
          {details ? (
            <>
              <div className="space-y-5">
                <h3 className="text-base font-semibold text-ui-strong">
                  Name and category
                </h3>
                <Field label="Service name" required>
                  <Input
                    value={manifest.title}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                </Field>
                <Textarea
                  label="What does this service help people do?"
                  value={manifest.description}
                  onChange={(e) => change({ description: e.target.value })}
                  rows={3}
                />
                <Select
                  label="Category"
                  value={manifest.category}
                  onValueChange={(v) => change({ category: String(v) })}
                  items={[
                    { value: "", label: "Choose a category" },
                    ...LANDING_CATEGORIES.map((c) => ({
                      value: c.slug,
                      label: c.title,
                    })),
                  ]}
                />
                <Select
                  label="Where do people start?"
                  value={manifest.entryPoint ?? ""}
                  onValueChange={(v) => change({ entryPoint: String(v) || null })}
                  items={[
                    { value: "", label: "Choose a starting point" },
                    ...manifest.pages.map((p) => ({
                      value: p.id,
                      label: servicePageLabel(p),
                    })),
                    ...(manifest.formId
                      ? [{ value: "form", label: "Application form" }]
                      : []),
                  ]}
                />
              </div>
              <div className="space-y-5">
                <h3 className="text-base font-semibold text-ui-strong">
                  Contact details
                </h3>
                {directoryError && (
                  <Banner variant="alert">{directoryError}</Banner>
                )}
                <Select
                  label="Department contact"
                  loading={contacts === null && !directoryError}
                  value={
                    (contacts ?? []).find(
                      (c) =>
                        c.title === value.manifest.contactDetails?.title &&
                        c.email === value.manifest.contactDetails?.email,
                    )?.id ?? ""
                  }
                  items={[
                    { value: "", label: "Enter public contact details" },
                    ...(contacts ?? []).map((c) => ({
                      value: c.id,
                      label: c.label,
                    })),
                  ]}
                  onValueChange={(id) => {
                    const c = (contacts ?? []).find((c) => c.id === id);
                    setValue((v) => ({
                      ...v,
                      manifest: {
                        ...v.manifest,
                        contactDetails: c
                          ? {
                              title: c.title || undefined,
                              email: c.email || undefined,
                              telephoneNumber: c.telephone || undefined,
                              ...(c.address ? { address: c.address } : {}),
                            }
                          : v.manifest.contactDetails,
                      },
                    }));
                  }}
                />
                <Field label="Public department name">
                  <Input
                    value={manifest.contactDetails?.title ?? ""}
                    onChange={(e) => setContact("title", e.target.value)}
                  />
                </Field>
                <Field label="Public email address">
                  <Input
                    type="email"
                    value={manifest.contactDetails?.email ?? ""}
                    onChange={(e) => setContact("email", e.target.value)}
                  />
                </Field>
                <Field label="Public telephone number">
                  <Input
                    type="tel"
                    value={manifest.contactDetails?.telephoneNumber ?? ""}
                    onChange={(e) =>
                      setContact("telephoneNumber", e.target.value)
                    }
                  />
                </Field>
                <p className="text-sm text-ui-subtle">
                  These details help applicants contact the department.
                  Department notifications use the department email chosen in
                  After submission.
                </p>
              </div>
              <div className="space-y-5">
                <h3 className="text-base font-semibold text-ui-strong">
                  Release
                </h3>
                <Select
                  label="Who can use this service?"
                  value={manifest.visibility ?? "draft"}
                  onValueChange={(v) =>
                    change({ visibility: v as "draft" | "preview" | "public" })
                  }
                  items={{
                    draft: "Keep as a draft",
                    preview: "People with preview access",
                    public: "Everyone",
                  }}
                />
              </div>
            </>
          ) : (
            <DeliverySettings
              value={value}
              showActions={showActions}
              onChange={setValue}
              contacts={contacts}
              error={directoryError}
            />
          )}
        </LayerCard.Primary>
        <LayerCard.Secondary className="m-0 flex-wrap justify-between p-3">
          <p role="status" className="text-sm text-ui-subtle">
            {busy
              ? "Saving changes…"
              : dirty
                ? "Unsaved changes"
                : saved
                  ? "Changes saved"
                  : details
                    ? "Save to update the service draft."
                    : "Save to apply these settings to the form."}
          </p>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={busy || !manifest.title.trim()}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </LayerCard.Secondary>
      </LayerCard>
    </section>
  );
}

type SubmissionAction = NonNullable<
  NonNullable<ServiceSnapshot["recipe"]>["processors"]
>[number];

function isApplicantEmail(
  p: SubmissionAction,
): p is Extract<SubmissionAction, { type: "email" }> {
  return (
    p.type === "email" &&
    typeof p.config.recipientField === "string" &&
    !!p.config.recipientField.trim() &&
    classifyRecipientField(p.config.recipientField) === "submitted"
  );
}

function DeliverySettings({
  value,
  showActions,
  onChange,
  contacts,
  error,
}: {
  value: ServiceSnapshot;
  showActions: boolean;
  onChange: (v: ServiceSnapshot) => void;
  contacts: MdaContact[] | null;
  error: string | null;
}) {
  const recipe = value.recipe;
  const [fields, setFields] = useState<
    { value: string; label: string }[] | null
  >(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionFields, setActionFields] = useState<ResolvedFieldId[]>([]);
  useEffect(() => {
    if (!recipe) return;
    let active = true;
    previewRecipe({ data: { recipe } })
      .then((contract: ServiceContract) => {
        if (active) {
          setFields(
            contract.steps.flatMap((step) =>
              step.elements
                .filter((field) => field.htmlType === "email")
                .map((field) => ({
                  value: `${step.stepId}.${field.fieldId}`,
                  label: `${step.title} · ${field.label}`,
                })),
            ),
          );
          setActionFields(
            contract.steps.flatMap((step) =>
              step.elements.map((field) => ({
                fieldId: field.fieldId,
                editorFieldId: `${step.stepId}.${field.fieldId}`,
                stepId: step.stepId,
                stepTitle: step.title,
                display: field.label,
                isBoolean: field.htmlType === "show-hide",
                isNumeric: field.htmlType === "number",
              })),
            ),
          );
          setFieldError(null);
        }
      })
      .catch(() => {
        if (active)
          setFieldError(
            "Email questions could not be loaded. Reopen this page to try again. Your saved emails are unchanged.",
          );
      });
    return () => {
      active = false;
    };
  }, [recipe?.steps]);
  if (!recipe)
    return (
      <div className="space-y-3">
        <p className="text-sm text-ui-subtle">
          Add an application form before setting up submission emails.
        </p>
        <AppLink
          to="/services"
          search={{ service: value.manifest.serviceId, tab: "form" }}
        >
          Add an application form
        </AppLink>
      </div>
    );
  const processors = recipe.processors ?? [];
  const applicantEmails = processors.filter(isApplicantEmail);
  const departmentEmails = processors.filter(
    (p) => p.type === "email" && p.config.recipientField === "config.mdaEmail",
  );
  const otherEmails = processors.filter(
    (p) =>
      p.type === "email" &&
      !isApplicantEmail(p) &&
      !departmentEmails.includes(p),
  );
  const integrations = [
    ...processors.filter((p) => p.type !== "email"),
    ...(value.pendingConfig.processors ?? []),
  ];
  const departmentId = value.pendingConfig.mdaContactId;
  const department = contacts?.find((c) => c.id === departmentId);
  const sharedConnection =
    !!departmentId && processors.some((p) => p.type === "webhook");
  const updateProcessors = (
    next: typeof processors,
    mdaContactId = departmentId,
  ) =>
    onChange({
      ...value,
      recipe: { ...recipe, processors: next },
      pendingConfig: { ...value.pendingConfig, mdaContactId },
    });
  const subjectField = (email: SubmissionAction, label: string) => {
    if (email.type !== "email") return null;
    const ruleBased =
      email.config.subject != null && typeof email.config.subject !== "string";
    return (
      <Input
        key={processors.indexOf(email)}
        label={label}
        value={
          typeof email.config.subject === "string" ? email.config.subject : ""
        }
        readOnly={ruleBased}
        description={
          ruleBased
            ? "This subject is set by a rule."
            : "Optional. Leave blank to use the default subject."
        }
        onChange={(e) => {
          const config = { ...email.config };
          if (e.target.value) config.subject = e.target.value;
          else delete config.subject;
          updateProcessors(
            processors.map((p) => (p === email ? { ...email, config } : p)),
          );
        }}
      />
    );
  };
  const builderSearch = {
    formId: recipe.formId,
    service: value.manifest.serviceId,
  };
  return (
    <>
      <section
        className="space-y-4"
        aria-labelledby="department-emails-heading"
      >
        <div>
          <h3 id="department-emails-heading" className="font-semibold">
            Email the department
          </h3>
          <p className="mt-1 text-sm text-ui-subtle">
            Send application details to the staff who process them.
          </p>
        </div>
        {error && (
          <Banner variant="alert">
            The department directory could not be loaded. Reopen this page to
            try again; your saved recipient is unchanged.
          </Banner>
        )}
        <Select
          label="Department notification email"
          loading={contacts === null && !error}
          disabled={!!error}
          value={departmentEmails.length ? (departmentId ?? "saved") : "none"}
          description={
            departmentEmails.length && department?.mdaEmail
              ? `Applications will be emailed to ${department.mdaEmail}.`
              : undefined
          }
          items={[
            { value: "none", label: "Do not send a department email" },
            ...(departmentEmails.length && !department
              ? [
                  {
                    value: departmentId ?? "saved",
                    label: departmentId
                      ? "Saved department (unavailable)"
                      : "Choose a department",
                  },
                ]
              : []),
            ...(contacts ?? []).map((c) => ({
              value: c.id,
              label: `${c.label}${c.mdaEmail ? ` · ${c.mdaEmail}` : " · No notification email"}`,
              disabled:
                !z.email().safeParse(c.mdaEmail).success ||
                (sharedConnection && c.id !== departmentId),
            })),
          ]}
          onValueChange={(id) => {
            if (id === "none") {
              updateProcessors(
                processors.filter((p) => !departmentEmails.includes(p)),
              );
              return;
            }
            const contact = contacts?.find((c) => c.id === id);
            if (
              !contact ||
              !z.email().safeParse(contact.mdaEmail).success ||
              (sharedConnection && contact.id !== departmentId)
            )
              return;
            updateProcessors(
              departmentEmails.length
                ? processors
                : [
                    ...processors,
                    {
                      type: "email",
                      config: {
                        recipientField: "config.mdaEmail",
                        label: "Department notification",
                      },
                    },
                  ],
              contact.id,
            );
          }}
        />
        {departmentEmails.length > 0 && (
          <div className="space-y-1 text-sm text-ui-subtle">
            <h4 className="font-medium text-ui-default">
              What the department receives
            </h4>
            <p>
              A submission reference, the applicant’s answers and uploaded
              documents. This summary is generated automatically; its layout
              cannot be edited here.
            </p>
            <p>You can change the recipient above and the subject below.</p>
          </div>
        )}
        {departmentEmails.map((email, i) =>
          subjectField(
            email,
            departmentEmails.length > 1
              ? `Department email ${i + 1} subject`
              : "Department email subject",
          ),
        )}
        {departmentEmails.length > 0 &&
          !department &&
          contacts !== null &&
          !error && (
            <p className="text-sm text-ui-subtle">
              {departmentId
                ? "The saved department is unavailable. Choose another department to receive applications."
                : "Choose the department that should receive these applications."}
            </p>
          )}
        {department &&
          !z.email().safeParse(department.mdaEmail).success &&
          departmentEmails.length > 0 && (
            <p className="text-sm text-ui-danger">
              Add a notification email for this department before accepting
              applications.
            </p>
          )}
        {sharedConnection && (
          <p className="text-sm text-ui-subtle">
            Your system connection also uses this department. Manage the shared
            department in the form’s contact settings.
          </p>
        )}
        {departmentEmails.length > 1 && (
          <p className="text-sm text-ui-subtle">
            {departmentEmails.length} emails are configured for this department.
            Review them in the email settings below.
          </p>
        )}
        {otherEmails.map((p, i) => {
          const summary = submissionActionSummary(
            p,
            {},
            value.manifest.contactDetails?.email,
          );
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div>
                <p className="font-medium">{summary.title}</p>
                <p className="mt-1 text-ui-subtle">{summary.description}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  updateProcessors(processors.filter((entry) => entry !== p))
                }
                aria-label={`Remove ${summary.title.toLowerCase()}`}
              >
                Remove
              </Button>
            </div>
          );
        })}
        <AppLink
          to="/builder"
          search={{ ...builderSearch, view: "contactDetails" }}
        >
          Edit public contact details
        </AppLink>
      </section>
      <section
        className="space-y-4 border-t border-ui-hairline pt-6"
        aria-labelledby="applicant-emails-heading"
      >
        <div>
          <h3 id="applicant-emails-heading" className="font-semibold">
            Email the applicant
          </h3>
          <p className="mt-1 text-sm text-ui-subtle">
            Confirm that their application was received, using the email address
            they enter in the form.
          </p>
        </div>
        {fieldError && <Banner variant="alert">{fieldError}</Banner>}
        {(applicantEmails.length ? applicantEmails : [null]).map((p, i) => {
          const recipient = p ? String(p.config.recipientField) : "none";
          return (
            <Select
              key={i}
              label={
                applicantEmails.length > 1
                  ? `Applicant email ${i + 1}`
                  : "Applicant email"
              }
              loading={fields === null && !fieldError}
              disabled={!!fieldError}
              value={recipient}
              items={[
                { value: "none", label: "Do not send a confirmation email" },
                ...(p && !fields?.some((f) => f.value === recipient)
                  ? [
                      {
                        value: recipient,
                        label: `Saved email question: ${recipient}`,
                      },
                    ]
                  : []),
                ...(fields ?? []),
              ]}
              onValueChange={(next) => {
                if (next === "none") {
                  updateProcessors(processors.filter((entry) => entry !== p));
                  return;
                }
                if (!next || !fields?.some((f) => f.value === next)) return;
                updateProcessors(
                  p
                    ? processors.map((entry) =>
                        entry === p && entry.type === "email"
                          ? {
                              ...entry,
                              config: { ...entry.config, recipientField: next },
                            }
                          : entry,
                      )
                    : [
                        ...processors,
                        {
                          type: "email",
                          config: {
                            recipientField: String(next),
                            label: "Applicant confirmation",
                          },
                        },
                      ],
                );
              }}
            />
          );
        })}
        {fields?.length === 0 && (
          <p className="text-sm text-ui-subtle">
            Add an email question to the form to send a confirmation email.
          </p>
        )}
        {applicantEmails.length > 0 && (
          <div className="space-y-2 text-sm text-ui-subtle">
            <h4 className="font-medium text-ui-default">
              What the applicant receives
            </h4>
            <p>
              A receipt with their reference number and the guidance from your
              confirmation page. Their answers and uploaded documents are not
              included.
            </p>
            <p>
              You can change the recipient above, the subject below and the
              confirmation guidance. The email layout is fixed.
            </p>
            <AppLink
              to="/builder"
              search={{ ...builderSearch, step: "submission-confirmation" }}
            >
              Edit email and confirmation guidance
            </AppLink>
          </div>
        )}
        {applicantEmails.map((email, i) =>
          subjectField(
            email,
            applicantEmails.length > 1
              ? `Applicant email ${i + 1} subject`
              : "Applicant email subject",
          ),
        )}
      </section>
      <section
        className="space-y-3 border-t border-ui-hairline pt-6"
        aria-labelledby="confirmation-page-heading"
      >
        <div>
          <h3 id="confirmation-page-heading" className="font-semibold">
            Show a confirmation page
          </h3>
          <p className="mt-1 text-sm text-ui-subtle">
            After submitting, applicants see their reference and what happens
            next. This page appears even when emails are off.
          </p>
        </div>
        <AppLink
          to="/builder"
          search={{ ...builderSearch, step: "submission-confirmation" }}
        >
          Edit confirmation page
        </AppLink>
      </section>
      <Collapsible
        defaultOpen={showActions}
        className="border-t border-ui-hairline pt-6"
      >
        <Collapsible.DefaultTrigger>
          Advanced action settings
        </Collapsible.DefaultTrigger>
        <Collapsible.Panel>
          <div className="space-y-4 pt-4">
            {integrations.length ? (
              integrations.map((p, i) => {
                const summary = submissionActionSummary(p);
                return (
                  <div key={i} className="text-sm">
                    <p className="font-medium">{summary.title}</p>
                    <p className="mt-1 text-ui-subtle">{summary.description}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-ui-subtle">
                Connect a case management system, export answers, or collect a
                payment if this service needs it.
              </p>
            )}
            <ServiceSubmissionActions
              value={value}
              onChange={onChange}
              fields={actionFields}
            />
          </div>
        </Collapsible.Panel>
      </Collapsible>
    </>
  );
}

function ServiceSubmissionActions({
  value,
  onChange,
  fields,
}: {
  value: ServiceSnapshot;
  onChange: (value: ServiceSnapshot) => void;
  fields: ResolvedFieldId[];
}) {
  if (!value.recipe) return null;
  const recipe = value.recipe;
  let configIndex = 0;
  const processors = mergeDbProcessors(
    recipe.processors?.map((p, i) => ({ ...p, id: `recipe-${i}` })),
    value.pendingConfig.processors,
    () => `config-${configIndex++}`,
  );
  const draft = {
    ...EMPTY_DRAFT,
    processors,
    contactDetails: recipe.contactDetails ?? value.manifest.contactDetails,
  };
  return (
    <ProcessorsEditor
      embedded
      draft={draft}
      fields={fields}
      dispatch={(action) => {
        const next = recipeReducer(draft, action);
        onChange({
          ...value,
          recipe: {
            ...recipe,
            processors: (next.processors ?? [])
              .filter((p) => p.type !== "payment")
              .map(({ id: _id, ...p }) => p),
          },
          pendingConfig: {
            ...value.pendingConfig,
            processors: extractDbProcessors(next.processors),
          },
        });
      }}
    />
  );
}
