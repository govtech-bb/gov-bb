---
format: govbb-form
formatVersion: 2
title: Existing application
---

# About you

::page{#about}

::multiple-choice[Application type]{#type}
- :option[Business]{#business optionValue="business"}
- :option[Person]{#person optionValue="person"}

::text[Name]{#name required}

::number[Employees]{#employees}

:::calculated-fields{#total}
```json
{"calculatedFields":[{"id":"staff","name":"Staff total","type":"NUMBER","value":0}]}
```
:::

:::logic{#wording}
```json
{"logicalOperator":"AND","conditionals":[{"id":"business-condition","type":"SINGLE","field":"type","comparison":"IS","value":"business"}],"actions":[{"id":"label","type":"CHANGE_LABEL","changeLabel":{"target":"name","text":"Business name"}},{"id":"formula","type":"CALCULATE","calculate":{"field":"total:staff","operator":"FORMULA","expression":"{{employees}} + 1"}}]}
```
:::
