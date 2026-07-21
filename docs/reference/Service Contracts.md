# Understanding Service Contracts

This document serves to provide an explanation for what Service Contracts are, their purpose, how they work, and how to consume them.

## What is a Service Contract

A service contract is a standardized format and schema (currently JSON) that represents the structure, content, and rules for a submissible form.

An example service contract is present in [Example Service Contract](../../apps/forms/contracts/example-service-contract.json) for reference.

## Why do we need Service Contracts?

Service contracts are useful, as they provide a shared, centralized and digestible contract that explains the structure of a submissible form, any validation rules and any unique behaviours specific to the system.

The idea is that a "client", where "client" refers to any user interface, would be able to accept a service contract and be able to render, or accept values in accordance to the structure of the contract. 
Then, with the values gathered, the client would be able to submit those values to an API that is also built to handle the same specification allowing for a full end to end service.

Service Contracts are useful, as they allow for a standardized structure, that then any type of client would be able to use to communicate with the same server, to provide a consistent experience.

Examples of clients include (but are not limited to):

- AI Chat Bot
- Web UI
- Terminal User Interface
- WhatsApp Chat

## Structure of a Service Contract

A Service Contract is represented by the following TypeScript interface:

```ts

interface ServiceContract {
  formId: string;
  title: string;
  description?: string;
  contactDetails?: ContactDetails;
  steps: FormStep[]
  processors: Processor[];
  meta: Meta;
  nextSteps: string;
}
```

Where:  

```ts
interface ContactDetails { 
  title: string;
  telephoneNumber: string;
  email: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    country: string
  }
}

interface FormStep {
  stepId: string;
  title: string;
  description?: string;
  elements: Primitive[];
  behaviours: Behaviour[];
  markdownContent?: string;
  nextSteps: NextSteps[];
}

interface Primitive {
  fieldId: string;
  label: string;
  name?: string;
  htmlType: string;
  placeholder?: string;
  hint?: string;
  defaultValue?: Any;
  value: Any;
  meta: {
    pii?: boolean;
    sensitive?: boolean;
    isDisabled?: boolean;
    isHidden?: boolean;
  };
  behaviours?: Behaviour[];
  validations: ValidationRule;
  options?: {label: string; value: string}[];
  multiple?: boolean;
  mask?: string;
  ui?: {
    width?: "short" | "medium" | "long";
    hideLabel?: boolean
  };
}

interface Processor {
  type: string;
  config: Object;
}

interface ServiceContractMeta {
  version?: string;
  visibility: "public" | "preview" | "draft" | "maintenance";
  requiresPayment: boolean;
  closeAfter?: string;
  createdAt: string;
  updatedAt: string;
}
```

Semantics are as important as the types themselves, so next will explain the point of each of them.

### Service Contract

At a high level, a service contract is made up of:

- FormId: A unique identifier for a form.
- title: A title for the form
- Description: An optional description or subheading.
- ContactDetails: Contact information for the owner of the form.
- Steps: Array of steps that make up the form
- Processors: Actions a server should take after receiving a submission.
- Meta: Meta information for the form.
- NextSteps: Information for the applicant after submitting a form telling them what they can do next.

### Form Step

Services provided by the service contract are separated into logical sections, which we refer to as "Form Steps".

These are designed to group a series of related fields that all seek to gain a specific set of information.

For example, a step could be titled "Applicant Information", and will contain fields to get an applicant's Full Name, telephone number, email address, and physical address.

Form steps consist of the following:

- Step ID: An id that is unique to the current form that uniquely identifies this step.
- title: A title for the step, for example "Applicant Information"
- Description: Optional subtitle for the step
- Elements: The fields that are used to capture information.
- Behaviours: Special step level behaviours
- markdownContent: Static content to display instead of the elements.

### Primitives / Elements

Primitives are the root level building blocks for all forms, and each of them represent a field that is requesting information.

At its most basic, a primitive consists of:

- Field ID: An ID that uniquely identifies a field in the current step.
- label: A label to display to a user when requesting information.
- htmlType: A semantic type that indicates what type of data the field is expecting.
- validations: An object containing validation rules for how data provided to the field should be validated.

### Understanding Behaviours

Behaviours are a way to affect the journey a user takes while filling out a form, along with dynamically affecting the content required for the form to be marked as "complete".

Behaviours are defined and supported by the provider service, and are documented in the service contract on "Steps" and "Elements".

In this system, we have the following behaviours:

- ConditionalOn: A conditional behaviour that will only show the element if a set condition is met. This has a `field` and a `step` variant.
- OptionalIf: Makes an element optional if a set condition is met, but does not affect visibility.
- Repeatable: Allows for a step to be repeated a specified number of times, to collect different copies of the same information. For example, requesting a user to enter their previous work experiences.
- SharedFields: This is used alongside the `Repeatable` behaviour, and allows for a specified set of fields to become shared across the different repeatable instances, so a user does not have to provide the same information multiple times.
- FieldArray: Allows for a field to be repeated a specified number of times, to collect different copies of the same information. For example, requesting a user to add another phone number.

### Processors

Processors are actions that are to be taken after a successful submission of a form, and are defined in the service contract. For example, these could be requesting payments, sending emails, calling webhooks, or the like.

If there is an API provider, then the processors can be stripped out of the contract sent to the client, such that the client does not have knowledge of them, allowing the client to focus on just collecting the values, and submitting them. However, certain processors will require the client to perform some additional actions, as such, a flag should be set in the `Meta` of the service contract, which will let the client know what kind of responses the server will return, and how to respond to them.

### Service Contract Meta

The `Meta` object is used to provide additioanl information about the specific service contract, and is shared between the client and provider.

In this system, we store the following information in the `Meta` object:

- version: The version of this service contract.
- visibility: Whether the service is public, hidden, draft, or under maintenance.
- requiresPayment: Whether the service requires payment to be submitted. This should be present and set to `true` when a payment processor is included so the client knows that it may need to handle payments.
- closeAfter: The date after which the service is no longer available for submissions.
- createdAt: The date the service contract was created.
- updatedAt: The date the service contract was last updated.

This object can be extended in the future to include additional information, so it is very important that a provider lets the clients know what options are available, and how to handle them.

## Using Service Contracts

The source of truth for a service contract is on the provider side, which in most cases, will be an API, which will be responsible for processing form submissions.

Therefore, the service contracts for a service are to be built, and be accessible via the provider.

An intended client that wants to use the service contract, will request the contract from the provider, and then be able to render the service and present to the user, keeping in mind custom behaviours that can affect a user's journey through the form.

A client that is to consume a service contract, should primarily be concerned with being able to take in the information from a user that the contract is requesting, and account for the behaviours related to the fields and steps.

The provider should provide a package that should be used for validation, so a client does not necessarily need to handle validation on its own, only needing to do as such to provide a better user experience.
