---
format: "govbb-form"
formatVersion: 2
title: "Apply for a permit to play loud music"
description: "Apply for a permit to play amplified music at an event."
contactDetails:
  title: "Permits Office"
  telephoneNumber: "+1 (246) 555-0100"
  email: "permits@example.gov.bb"
meta:
  visibility: "preview"
---

# Tell us about the event

::description[We use this to check that amplified music is allowed where and when you plan it.]

Use this form to apply for a permit for an event with amplified music.

You will need\:

- the date and address of the event

- a site plan if you need to close a road

::text[Event name]{#event-name required}

::dropdown[Which parish is the event in?]{#event-parish required}
- Christ Church
- Saint Michael

::date[Event date]{#event-date required relativeDate="futureOrToday"}
::hint[For example, 27 3 2026]

::text[National Identification (ID) number]{#national-id preset="national-id-number"}
::hint[This is on your National Registration card. For example, 900314-0052]

:::show-hide[Use passport number instead]

If you don’t have a National ID number, you can use your passport number instead.

::text[Passport number]{#passport-number preset="passport-number"}

:::

---

# Road closure

::multiple-choice[Do you need to close a road?]{#road-closure-needed required}
- :option[Yes]{#yes}

  ::text[How long will the road be closed?]{#closure-duration required hidden}

  ::block{#apply-at-least-14-days-before-the-event-if-you-need-to-close}
  ::warning[Apply at least 14 days before the event if you need to close a road.]

- No

:::logic{#conditional-logic}
```json
{
  "logicalOperator": "AND",
  "conditionals": [
    {
      "id": "migration-condition-1",
      "type": "SINGLE",
      "field": "road-closure-needed",
      "comparison": "IS",
      "value": "yes"
    }
  ],
  "actions": [
    {
      "id": "migration-action-1",
      "type": "SHOW_BLOCKS",
      "showBlocks": [
        "closure-duration",
        "apply-at-least-14-days-before-the-event-if-you-need-to-close"
      ]
    }
  ]
}
```
:::

::long-answer[Which roads?]{#roads}

::file-upload[Upload a site plan]{#site-plan required}

---

# Sound systems

::repeat-page{min="1" max="5" instanceLabel="Sound system"}

::text[Type of sound system]{#sound-system-type required}

::number[Number of speakers]{#speaker-count required}

::text[Speaker brand]{#speaker-brand required repeatMin="1" repeatMax="4"}

---

# Check your answers

::page{type="check-answers"}

---

# Declaration

::page{type="declaration"}

::checkboxes[Declaration]{#declaration required}
- I confirm the information I have given is correct

---

# Application sent

::page{type="confirmation"}

We will email you within 5 working days.

## What happens next

1. We check your application.

1. We may call you to ask about the event.

1. We email you your permit.

:::source-state
```json
{
  "questions": {
    "closure-duration": {
      "label": {
        "settings": {
          "hidden": true
        }
      }
    }
  },
  "nodes": {
    "apply-at-least-14-days-before-the-event-if-you-need-to-close": {
      "settings": {
        "hidden": true
      }
    }
  }
}
```
:::
