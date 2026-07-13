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

## Consuming a Service Contract
