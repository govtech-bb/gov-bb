# Form Renderer

## Overview

The **Form Renderer** is the client-side runtime that turns a **Form Service Contract** (the JSON definition of a service/form) into a working user experience.

At a high level, it:

- Fetches and interprets the service’s form definition (pages/steps, and fields)
- Renders the UI in a consistent, design-system-aligned way
- Applies validation and behavior rules (including conditional logic) to produce clear, predictable user journeys
- Produces a submission payload that matches the contract, ready to send to the form processing API

### Key Responsibilities

- **Schema → UI**: convert the ordered schema into rendered screens, sections, and inputs
- **Validation & errors**: run client-side validation, show inline errors, and generate page-level error summaries
- **Conditional logic**: show/hide fields or sections and enforce requirements based on prior answers
- **Submission shaping**: build a stable, structured payload (and handle file inputs where relevant)

### Where It Fits in the Platform

The renderer sits on the frontend and is intentionally **not** responsible for building or editing contracts. The backend remains the authoritative source for constructing and serving service contracts whereas the renderer consumes those contracts for creating the form interface.

## Pipeline

To go from contract to a user fillable form, the following transformations to the contract need to be made:

- Converting the contract elements into TSX.
- Creating a `zod` schema based on the contract elements. This is to be used by react-forms-hook to provide client side validation.
- Facilitate dynamic behaviors for forms, such as conditional rendering and repeatable steps.
- Render the output to the user.

## Rendering Process/Flow

![image.png](attachment:d5f2fccd-ce60-4113-9b10-705ba77a3339:image.png)

1. Citizen visits URL for a form.
2. Web client fetches service contract for form, and stores it in memory.
3. Web client checks cache / local directory for a pre-built form, and compares the version to the version on the service contract.
    1. If they are the same, then the cached / local form is shared, and this flow ends.
4. If versions are different, then:
    1. Parser then parses the service contract, extracting metadata, the HTML fields, labels, behaviors, validation rules, etc.
    2. Parser then converts the elements to TSX snippets.
    3. Validation builder applies validation rules to all their fields.
    4. Behavior builder applies behavior rules to their respective fields.
    5. Design adapter applies the design system to the snippets.
    6. Parsed webpage is stored as a file on the system, cache is updated with the form id and version, and then page is then served as a form for citizens to fill.

## Rendering The Form

A rendered form should:

- Support multi-steps, with pagination.
- Support client side validation leveraging `onChange`(with a delay), `onSubmit`.
- Support client side behavior.

Each Fragment, should have support for at least the following props:

- label
- hint
- placeholder
- defaultValue
- disabled

Other props, where appropriate, can include:

- options
- multiple

## Design Adapter

The design adapter will make use of style systems implemented using [CSS Module Stylesheets](https://create-react-app.dev/docs/adding-a-css-modules-stylesheet/). CSS Modules will ensure that the designs applied are scoped locally and avoid conflicting class names.

### Design Systems

Design systems are plug-and-play and can be swapped by updating the `DESIGN_SYSTEM` environment variable which points to the current design system used for styling forms.

There should be an established set of accepted class names that any new Design System should use to implement their own styling. A `template.module.css` file should be created and provided for new Design Systems to be based on.

A Design System will be written in a `.module.css`  file and imported into the Design Adapter from the .env as follows (assuming there is a `basic.module.css`):

In: `.env`

```
DESIGN_SYSTEM=basic
```

In: `styles/basic.module.css`

```css
.label {
	font-weight: 600;
	color: #0e0e0e;
}

...
```

## Key Interfaces / Abstract Classes

Note: These are all snippets.

```tsx
// Responsible for taking a field schema and building tsx out of it
interface ITSXBuilder { 
	createTextField(props: Primitive): React.FC;
	createNumberField(props: Primitive): React.FC;
}

interface IStepValidation {
	fieldId: string; // ID for field
	validations: ValidationConfig;
}

interface IStepBehavior {
	stepId: string; // ID Of the step
	behaviours: Behaviour[]; // Behaviours for that step.
}

interface IParser {
	getTSXElements(steps: FormStep[]): Array<React.FC>;
	buildZodSchemaForStep(id: string, validations: IStepValidation[]): z.ZodObject;
	buildZodSchema(schemas: Array<z.ZodObject>): z.ZodObject;
	getBehaviours(steps: FormStep[]): IStepBehavior[]; // Returns a Mapping for behaviours for the renderer.
}
```
