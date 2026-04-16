# Design System Documentation

## Overview

The modular-forms design system uses CSS Modules to style form fields. Each design system is a CSS Module file that exports styles scoped to the `.formRoot` class.

## Design Systems Available

| Name        | File                          | Description                                         |
| ----------- | ----------------------------- | --------------------------------------------------- |
| `govtechbb` | `styles/govtechbb.module.css` | Barbados government design system with brand colors |
| `basic`     | `styles/basic.module.css`     | Minimal design system with basic styling            |
| `template`  | `styles/template.module.css`  | Starter template with commented placeholders        |

## Selecting a Design System

Set the `DESIGN_SYSTEM` environment variable in your `.env` file:

```bash
DESIGN_SYSTEM=govtechbb
```

## Field Types

The system supports the following field types defined in `packages/form-types/src/primitive.type.ts`:

| `htmlType` | Description                          | Requires Options |
| ---------- | ------------------------------------ | ---------------- |
| `text`     | Single-line text input               | No               |
| `textarea` | Multi-line text input                | No               |
| `number`   | Numeric input                        | No               |
| `tel`      | Telephone number                     | No               |
| `email`    | Email address                        | No               |
| `date`     | Date picker (3-part: day/month/year) | No               |
| `select`   | Dropdown select                      | Yes              |
| `checkbox` | Checkbox group                       | Yes              |
| `radio`    | Radio button group                   | Yes              |
| `file`     | File upload                          | No               |

---

## HTML Output by Field Type

### Text, Textarea, Number, Tel, Email

```html
<div data-field>
  <label>Field Label</label>
  <input type="text" name="fieldId" />
</div>
```

### Select

```html
<div data-field data-select-field>
  <label>Field Label</label>
  <div data-select-control>
    <select name="fieldId">
      <option value="">-- Select --</option>
      <option value="value1">Label 1</option>
    </select>
  </div>
</div>
```

### Checkbox

```html
<fieldset data-fieldset>
  <legend>Field Label</legend>
  <div data-checkbox-group>
    <div data-checkbox-option>
      <input type="checkbox" name="fieldId" />
      <label>Option Label</label>
    </div>
  </div>
</fieldset>
```

### Radio

```html
<fieldset data-fieldset>
  <legend>Field Label</legend>
  <div data-radio-group>
    <div data-radio-item>
      <input type="radio" name="fieldId" />
      <label>Option Label</label>
    </div>
  </div>
</fieldset>
```

### Date

```html
<fieldset data-field data-date-field>
  <legend>Field Label</legend>
  <div data-date-group>
    <div data-date-part>
      <label>Day</label>
      <input />
    </div>
    <div data-date-part>
      <label>Month</label>
      <input />
    </div>
    <div data-date-part>
      <label>Year</label>
      <input />
    </div>
  </div>
</fieldset>
```

---

## CSS Selectors Reference

### Generic Elements (scoped to `.formRoot`)

| Selector             | Applies To                                  |
| -------------------- | ------------------------------------------- |
| `.formRoot`          | Root form container                         |
| `.formRoot h1`       | Primary heading                             |
| `.formRoot h2`       | Secondary heading                           |
| `.formRoot h3`       | Tertiary heading                            |
| `.formRoot label`    | All labels                                  |
| `.formRoot input`    | Text-like inputs (text, email, tel, number) |
| `.formRoot select`   | Select dropdowns                            |
| `.formRoot textarea` | Multi-line text inputs                      |
| `.formRoot button`   | Form buttons                                |
| `.formRoot fieldset` | Fieldset containers                         |
| `.formRoot legend`   | Fieldset legends                            |

### Data Attribute Selectors

| Selector                 | Applies To                        |
| ------------------------ | --------------------------------- |
| `[data-field]`           | Generic field wrapper             |
| `[data-fieldset]`        | Fieldset wrapper (checkbox/radio) |
| `[data-select-field]`    | Select field wrapper              |
| `[data-select-control]`  | Select control container          |
| `[data-date-field]`      | Date field container              |
| `[data-date-group]`      | Date parts container              |
| `[data-date-part]`       | Individual date part              |
| `[data-checkbox-group]`  | Checkbox group container          |
| `[data-checkbox-option]` | Individual checkbox option        |
| `[data-radio-group]`     | Radio group container             |
| `[data-radio-item]`      | Individual radio option           |
| `[data-hint]`            | Hint/help text                    |

### Pseudo-classes

| Selector         | Applies To                |
| ---------------- | ------------------------- |
| `:focus`         | Focused elements          |
| `:focus-visible` | Keyboard-focused elements |
| `:hover`         | Hovered elements          |
| `:disabled`      | Disabled controls         |
| `:invalid`       | Invalid controls          |
| `:checked`       | Checked checkboxes/radios |

---

## Creating a New Design System

### Step 1: Create the CSS Module File

Create a new file in `apps/web/src/styles/` (e.g., `mydesign.module.css`).

### Step 2: Define the Root Class

```css
.formRoot {
  /* CSS variables for theming */
  --primary-color: #3b82f6;
  --border-color: #000000;
  --focus-color: #3b82f6;
  --error-color: #ef4444;

  /* Base styles */
  font-family: system-ui, sans-serif;
  padding: 2rem;
}
```

### Step 3: Style Form Elements

```css
.formRoot label {
  font-size: 1rem;
  font-weight: 500;
}

.formRoot input,
.formRoot select,
.formRoot textarea {
  font-size: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.75rem;
}
```

### Step 4: Style Field-Specific Elements

Use data attributes for precise targeting:

```css
/* Text-like inputs */
.formRoot input:not([type="checkbox"]):not([type="radio"]) {
  /* styles */
}

/* Select dropdown */
.formRoot [data-select-field] select {
  appearance: none;
  /* custom arrow */
}

/* Checkbox group */
.formRoot [data-checkbox-group] {
  display: flex;
  flex-direction: column;
}

.formRoot [data-checkbox-group] input[type="checkbox"] {
  width: 1.5rem;
  height: 1.5rem;
}

/* Radio group */
.formRoot [data-radio-group] {
  display: flex;
  flex-direction: column;
}

.formRoot [data-radio-group] input[type="radio"] {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
}

/* Date picker parts */
.formRoot [data-date-group] {
  display: flex;
  gap: 1rem;
}

.formRoot [data-date-part] {
  display: flex;
  flex-direction: column;
}
```

> Note: The .formRoot class must be used as the root selector to ensure styles are scoped correctly. If this .formRoot class is missing, styles will not apply correctly.  

### Step 5: Register the Design System

Update `apps/web/src/lib/design-system/index.ts`:

```typescript
import mydesign from "@web/styles/mydesign.module.css";

const DESIGN_SYSTEMS = {
  basic,
  govtechbb,
  mydesign, // Add your new design system
} as const;
```

### Step 6: Select Your Design System

Set in environment:

```bash
DESIGN_SYSTEM=mydesign
```

---

## Complete CSS Selector Reference for All Field Types

### Text Input Fields (text, textarea, number, tel, email)

```css
/* Wrapper */
.formRoot [data-field] {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Label */
.formRoot [data-field] label {
  font-size: 1.25rem;
  font-weight: 700;
}

/* Input */
.formRoot [data-field] input,
.formRoot [data-field] textarea {
  font-size: 1.25rem;
  border: 0.125rem solid var(--color-black-00);
  border-radius: 0.25rem;
  padding: 1rem;
}
```

### Select Dropdown

```css
/* Wrapper */
.formRoot [data-select-field] {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Control container (for custom arrow positioning) */
.formRoot [data-select-field] [data-select-control] {
  position: relative;
}

/* Select element */
.formRoot [data-select-field] select {
  width: 100%;
  appearance: none;
  padding-right: 4.5rem;
}

/* Custom dropdown arrow (::after) */
.formRoot [data-select-field] [data-select-control]::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 1.5rem;
  transform: translateY(-40%);
  /* arrow shape */
}
```

### Checkbox Group

```css
/* Fieldset wrapper */
.formRoot fieldset[data-fieldset] {
  border: none;
  padding: 0;
  margin: 0 0 0.9375rem;
}

/* Legend (field label) */
.formRoot fieldset legend {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

/* Group container */
.formRoot [data-checkbox-group] {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Individual option */
.formRoot [data-checkbox-group] [data-checkbox-option] {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* Checkbox input */
.formRoot [data-checkbox-group] input[type="checkbox"] {
  width: 3rem;
  height: 3rem;
  appearance: none;
  border: 0.125rem solid var(--color-black-00);
  border-radius: 0;
  position: relative;
}

/* Checked state */
.formRoot [data-checkbox-group] input:checked::before {
  content: "";
  position: absolute;
  width: 1.1875rem;
  height: 1.1875rem;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: var(--color-teal-00);
}

/* Option label */
.formRoot [data-checkbox-group] [data-checkbox-option] label {
  font-size: 1.25rem;
  font-weight: 400;
  cursor: pointer;
}

/* Error state */
.formRoot [data-checkbox-group] input:invalid {
  border-color: var(--color-red-00);
}

/* Disabled state */
.formRoot [data-checkbox-group] input:disabled {
  opacity: 0.4;
}
```

### Radio Group

```css
/* Fieldset wrapper */
.formRoot fieldset[data-fieldset] {
  border: none;
  padding: 0;
  margin: 0 0 0.9375rem;
}

/* Legend (field label) */
.formRoot fieldset legend {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

/* Group container */
.formRoot [data-radio-group] {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Individual option */
.formRoot [data-radio-group] [data-radio-item] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Radio input */
.formRoot [data-radio-group] input[type="radio"] {
  width: 3rem;
  height: 3rem;
  appearance: none;
  border: 0.125rem solid var(--color-black-00);
  border-radius: 50%;
}

/* Checked state */
.formRoot [data-radio-group] input:checked {
  background: radial-gradient(
    circle,
    var(--color-teal-00) 35%,
    var(--color-white-00) 35%
  );
}

/* Error state */
.formRoot [data-radio-group] input:invalid {
  border-color: var(--color-red-00);
}

/* Disabled state */
.formRoot [data-radio-group] input:disabled {
  opacity: 0.4;
}
```

### Date Picker

```css
/* Fieldset wrapper */
.formRoot [data-date-field] {
  margin: 0;
}

/* Legend (field label) */
.formRoot [data-date-field] > legend {
  margin-bottom: 0.75rem;
}

/* Group container */
.formRoot [data-date-group] {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* Individual date part */
.formRoot [data-date-part] {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Day and Month width */
.formRoot [data-date-part]:nth-child(1),
.formRoot [data-date-part]:nth-child(2) {
  width: 5rem;
}

/* Year width */
.formRoot [data-date-part]:nth-child(3) {
  width: 8.75rem;
}
```

### Buttons

```css
/* Default button */
.formRoot button {
  font-size: 1.25rem;
  display: inline-flex;
  width: fit-content;
  background-color: var(--color-teal-00);
  color: var(--color-white-00);
  border: none;
  border-radius: 0.25rem;
  padding: 1.25rem 1.75rem;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

/* Hover state */
.formRoot button:hover {
  background-color: #1a777d;
  color: var(--color-white-00);
}
```

---
