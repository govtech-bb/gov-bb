import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ServiceManifest } from "@govtech-bb/form-types";
import { useFormsList } from "../builder/use-forms-list";
import { useMdaContacts } from "../builder/use-mda-contacts";
import { useContentList } from "../content/use-content-list";
import {
  EMPTY_PAGE,
  LANDING_CATEGORIES,
  appendServicePage,
  contentSlug,
  linkableForms,
  startPageContentPath,
  startPageUrl,
  subcategoriesFor,
} from "../../lib/content";
import { attachServiceForm, saveServiceDraft } from "../../lib/service-drafts";
import { AppLink } from "../app-link";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input, Textarea } from "../ui/input";
import { LayerCard } from "../ui/layer-card";
import { Radio } from "../ui/radio";
import { Select } from "../ui/select";
import { cn } from "../ui/utils/cn";
import { emptyService, serviceIdFor, useServiceIndex } from "./service-state";

const steps = [
  ["about", "About the service"],
  ["form", "Application form"],
  ["contact", "Department contact"],
] as const;
type Step = (typeof steps)[number][0];
type FormKind = "new" | "existing" | "none";

const intro: Record<Step, string> = {
  about:
    "Name the service and place it in a category. Together they make its public link.",
  form: "Choose how people apply. You can change the form later from the service.",
  contact:
    "Applicants see these details on the service. Edit them later in Settings › Contact details.",
};

const corners = [
  "-top-[3px] -left-[9px]",
  "-top-[3px] -right-[9px]",
  "-bottom-[3px] -left-[9px]",
  "-bottom-[3px] -right-[9px]",
];

export function CreateServiceWizard() {
  const navigate = useNavigate();
  const { entries } = useServiceIndex();
  const forms = useFormsList();
  const content = useContentList(true);
  const { contacts, loadError: directoryError } = useMdaContacts();
  const [step, setStep] = useState<Step>("about");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [form, setForm] = useState<{ kind: FormKind; formId: string }>({
    kind: "new",
    formId: "",
  });
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const serviceId = serviceIdFor(title.trim());
  const link = serviceId
    ? startPageUrl(category || "…", serviceId, subcategory)
    : "";
  const taken =
    !!serviceId &&
    (entries.some((e) => e.manifest.serviceId === serviceId) ||
      (content.pages ?? []).some((p) => contentSlug(p.path) === serviceId));
  const subcategories = subcategoriesFor(category);
  const owned = new Set(entries.map((e) => e.manifest.formId));
  const available = linkableForms(forms.forms ?? []).filter(
    (f) => !owned.has(f.formId),
  );
  const nameInUse = (forms.forms ?? []).some((f) => f.formId === serviceId);
  const kind: FormKind =
    form.kind === "new" && nameInUse ? "existing" : form.kind;
  const formId =
    kind === "existing"
      ? form.formId ||
        (available.some((f) => f.formId === serviceId) ? serviceId : "")
      : "";
  const contact = (contacts ?? []).find((c) => c.id === contactId);
  const contactDetails: ServiceManifest["contactDetails"] = contact
    ? {
        title: contact.title || undefined,
        email: contact.email || undefined,
        telephoneNumber: contact.telephone || undefined,
        ...(contact.address ? { address: contact.address } : {}),
      }
    : undefined;

  const position = steps.findIndex(([id]) => id === step);
  const last = position === steps.length - 1;
  const canContinue =
    step === "about"
      ? !!serviceId && !!category && !taken
      : step === "form"
        ? kind !== "existing" || !!formId
        : true;

  const create = async () => {
    setBusy(true);
    setError(null);
    const name = title.trim();
    const slug = `${serviceId}/index`;
    const pageFormId =
      kind === "existing" ? formId : kind === "new" ? serviceId : "";
    try {
      const base = emptyService(name);
      const snapshot = appendServicePage(
        {
          ...base,
          manifest: {
            ...base.manifest,
            description: description.trim(),
            category,
            subcategory,
            contactDetails,
          },
        },
        startPageContentPath(slug),
        {
          ...EMPTY_PAGE,
          title: name,
          slug,
          category,
          subcategory,
          formId: pageFormId,
          linkType: pageFormId ? "form" : "none",
        },
      );
      const draft = await saveServiceDraft({
        data: { expectedRevision: 0, snapshot },
      });
      setCreatedId(serviceId);
      if (kind === "existing")
        await attachServiceForm({
          data: { serviceId, expectedRevision: draft.revision, formId },
        });
      await navigate(
        kind === "new"
          ? {
              to: "/builder",
              search: { newFormId: serviceId, title: name, service: serviceId },
            }
          : { to: "/services", search: { service: serviceId } },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the service");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Create a service"
      className="relative min-h-full overflow-clip px-4 py-8 @min-[64rem]:py-12"
    >
      <div className="mx-auto grid max-w-5xl gap-6 @min-[64rem]:grid-cols-[10rem_minmax(0,40rem)_12rem] @min-[64rem]:gap-8">
        <h1 className="text-lg font-semibold text-ui-strong @min-[64rem]:pt-7 @min-[64rem]:text-right">
          Create a service
        </h1>
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-1.5 -inset-y-[100vh] border-x border-dashed border-ui-hairline"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-50vw] inset-y-0 border-y border-dashed border-ui-hairline"
          />
          {corners.map((corner) => (
            <span
              key={corner}
              aria-hidden="true"
              className={cn(
                "absolute size-[7px] rounded-[1.5px] bg-ui-elevated ring-1 ring-ui-line",
                corner,
              )}
            />
          ))}
          <LayerCard className="relative">
            <LayerCard.Primary className="gap-5 p-6 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold">{steps[position][1]}</h2>
                <p className="mt-2 text-sm text-ui-subtle">{intro[step]}</p>
              </div>
              {error && (
                <Banner variant="error" role="alert">
                  {createdId
                    ? `The service was created, but the form could not be connected. ${error}`
                    : error}
                  {createdId && (
                    <AppLink
                      size="sm"
                      to="/services"
                      search={{ service: createdId }}
                    >
                      Open service
                    </AppLink>
                  )}
                </Banner>
              )}
              {step === "about" && (
                <>
                  <Field
                    label="Service name"
                    required
                    description={
                      link ? (
                        <>
                          Public link <span className="font-mono">{link}</span>
                        </>
                      ) : (
                        "Letters and numbers in the name become the link."
                      )
                    }
                    error={
                      taken
                        ? "A service with this link already exists. Open it from the library."
                        : undefined
                    }
                  >
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      autoFocus
                      maxLength={250}
                    />
                  </Field>
                  <Select
                    label="Category"
                    value={category}
                    onValueChange={(v) => {
                      setCategory(String(v));
                      setSubcategory("");
                    }}
                    items={[
                      { value: "", label: "Choose a category" },
                      ...LANDING_CATEGORIES.map((c) => ({
                        value: c.slug,
                        label: c.title,
                      })),
                    ]}
                  />
                  {subcategories.length > 0 && (
                    <Select
                      label="Subcategory"
                      value={subcategory}
                      onValueChange={(v) => setSubcategory(String(v))}
                      items={[
                        { value: "", label: "No subcategory" },
                        ...subcategories.map((c) => ({
                          value: c.slug,
                          label: c.title,
                        })),
                      ]}
                    />
                  )}
                  <Textarea
                    label="What does this service help people do?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </>
              )}
              {step === "form" && (
                <>
                  {forms.loadError && (
                    <Banner variant="alert">{forms.loadError}</Banner>
                  )}
                  <Radio.Group
                    legend="Does this service have an application form?"
                    appearance="card"
                    value={kind}
                    onValueChange={(v) =>
                      setForm({ kind: v as FormKind, formId: "" })
                    }
                  >
                    <Radio.Item
                      value="new"
                      label="Build a new form"
                      disabled={nameInUse}
                      description={
                        nameInUse
                          ? "A form with this name already exists. Connect it instead."
                          : "Opens the form builder once the service is created."
                      }
                    />
                    <Radio.Item
                      value="existing"
                      label="Connect an existing form"
                      description="Reuse a form that is already in the builder."
                    />
                    <Radio.Item
                      value="none"
                      label="No form"
                      description="An information-only service. Add a form later if you need one."
                    />
                  </Radio.Group>
                  {kind === "existing" && (
                    <Select
                      label="Form"
                      value={formId}
                      onValueChange={(v) =>
                        setForm({ kind: "existing", formId: String(v) })
                      }
                      items={[
                        { value: "", label: "Choose a form" },
                        ...available.map((f) => ({
                          value: f.formId,
                          label: `${f.title || f.formId}${f.isPublished ? "" : " · draft"}`,
                        })),
                      ]}
                    />
                  )}
                </>
              )}
              {step === "contact" && (
                <>
                  {directoryError && (
                    <Banner variant="alert">{directoryError}</Banner>
                  )}
                  <Select
                    label="Department contact"
                    loading={contacts === null && !directoryError}
                    value={contactId}
                    onValueChange={(v) => setContactId(String(v))}
                    items={[
                      { value: "", label: "Add later in Settings" },
                      ...(contacts ?? []).map((c) => ({
                        value: c.id,
                        label: c.label,
                      })),
                    ]}
                  />
                </>
              )}
            </LayerCard.Primary>
            <LayerCard.Secondary className="m-0 flex-wrap justify-between p-3">
              {position === 0 ? (
                <AppLink variant="ghost" to="/services" search={{}}>
                  Cancel
                </AppLink>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setStep(steps[position - 1][0])}
                  disabled={busy}
                >
                  Back
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() =>
                  last ? void create() : setStep(steps[position + 1][0])
                }
                disabled={busy || !canContinue || !!createdId}
              >
                {busy ? "Creating…" : last ? "Create service" : "Continue"}
              </Button>
            </LayerCard.Secondary>
          </LayerCard>
        </div>
        <nav
          aria-label="Steps"
          className="order-first @min-[64rem]:order-none @min-[64rem]:pt-7"
        >
          <ol className="flex flex-wrap gap-x-2 @min-[64rem]:flex-col">
            {steps.map(([id, label], index) => (
              <li
                key={id}
                aria-current={step === id ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium",
                  step === id ? "text-ui-strong" : "text-ui-subtle",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    index <= position ? "bg-current" : "border border-current",
                  )}
                />
                {label}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </section>
  );
}
