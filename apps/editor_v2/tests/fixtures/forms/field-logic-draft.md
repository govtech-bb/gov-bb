---
format: govbb-form
formatVersion: 2
title: Business application
description: Compatibility fixture with draft content
contactDetails:
  title: Business team
  email: business@example.gov.bb
applicantEmail:
  question: email
  subject: Your application
meta:
  visibility: preview
future: {"zero":0,"no":false,"nothing":null}
---

# About the business

::page{#about}

::email[Email address]{#email required}

::multiple-choice[Applicant type]{#applicant required}
- :option[A business]{#business optionValue="registered-business"}
- :option[A person]{#person optionValue="individual"}

::text[Trading name]{#trading-name hidden}
::hint[Use the name on your registration.]

::date[Date of birth]{#birth-date}

::time[Closing time]{#closing-time step="90" isDisabled="true"}

::number[Employees]{#employees}

::checkbox-accordion[Business activities]{#activities required}

::block{#contact-note}
Your contact email is {{email|not supplied}}.

:::logic{#business-rule}
```json
{
  "logicalOperator": "AND",
  "conditionals": [{"id":"business-condition","type":"SINGLE","field":"applicant","comparison":"IS","value":"business"}],
  "actions": [
    {"id":"show-trading-name","type":"SHOW_BLOCKS","showBlocks":["trading-name"]},
    {"id":"label-trading-name","type":"CHANGE_LABEL","changeLabel":{"target":"trading-name","text":"Registered trading name"}},
    {"id":"title-business","type":"CHANGE_PAGE_TITLE","changePageTitle":{"target":"supporting","text":"Supporting business details"}}
  ]
}
```
:::

:::logic{#adult-rule}
```json
{
  "logicalOperator": "AND",
  "conditionals": [{"id":"age-condition","type":"SINGLE","field":"birth-date","comparison":"GREATER_OR_EQUAL_THAN","transform":"yearsSince","value":18}],
  "actions": [{"id":"require-time","type":"REQUIRE_ANSWER","requireAnswer":"closing-time"}]
}
```
:::

:::calculated-fields{#totals}
```json
{"calculatedFields":[{"id":"staff","name":"Staff total","type":"NUMBER","value":0},{"id":"unfinished","name":""}]}
```
:::

:::logic{#draft-rule}
```json
{
  "logicalOperator": "AND",
  "conditionals": [{"id":"unfinished-condition","type":"SINGLE"}],
  "actions": [{"id":"unfinished-action"},{"id":"calculate-staff","type":"CALCULATE","calculate":{"field":"totals:staff","operator":"FORMULA","expression":"{{employees}} + ("}}],
  "opaque":"employees"
}
```
:::

---

# Supporting details

::page{#supporting}

::text[Reference]{#reference repeatMin="1" repeatMax="3"}

:::source-state
```json
{
  "questions": {
    "activities": {
      "settings": {
        "groups": [{"id":"food-group","label":"Food businesses","higherRisk":true,"options":[{"id":"catering-option","label":"Catering","optionValue":"food-catering"},{"id":"retail-option","label":"Food retail","optionValue":"food-retail"}]}]
      }
    },
    "trading-name": {"label":{"settings":{"hidden":true}}},
    "employees": {"settings":{"hasMinNumber":true,"minNumber":1,"hasMaxNumber":true,"maxNumber":20,"future":{"zero":0,"no":false,"empty":""}}}
  }
}
```
:::
