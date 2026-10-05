# Form terminology

Use these terms in the form builder and its documentation. GOV.UK patterns guide wording and form structure; the product uses the GovBB visual identity. The editor does not yet provide a respondent service or claim full GOV.UK conformance.

| Term | Meaning |
| --- | --- |
| Service name | The name of the service, separate from the current page's heading. See [service navigation](https://design-system.service.gov.uk/components/service-navigation/). |
| Page heading | The heading for the current page. On a page asking one question, its label or legend can also be the heading. See [question pages](https://design-system.service.gov.uk/patterns/question-pages/). |
| Question label | The wording associated with an answer input. For a group of related controls, such as radios, the shared question is a **legend**. The builder uses Question label as its authoring term. See [text input](https://design-system.service.gov.uk/components/text-input/) and [fieldset](https://design-system.service.gov.uk/components/fieldset/). |
| Hint text | Brief help needed to answer a question. Longer explanations belong in content blocks. See [question-page hints](https://design-system.service.gov.uk/patterns/question-pages/#hint-text). |
| Check answers | A page for reviewing and changing answers before submission. See [Check answers](https://design-system.service.gov.uk/patterns/check-answers/). |
| Confirmation page | Confirms that the transaction is complete and explains what happens next. Its heading should describe the outcome, such as “Application submitted”. See [Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/). |
| Title (Mr, Ms, Dr) | A person's title, separate from a question label or page heading. Ask for it only when the service needs it. See [Names](https://design-system.service.gov.uk/patterns/names/). |

Use the GOV.UK component names in insertion menus: [Text input](https://design-system.service.gov.uk/components/text-input/), [Textarea](https://design-system.service.gov.uk/components/textarea/), [Radios](https://design-system.service.gov.uk/components/radios/), [Checkboxes](https://design-system.service.gov.uk/components/checkboxes/), [Select](https://design-system.service.gov.uk/components/select/), [Date input](https://design-system.service.gov.uk/components/date-input/) and [Details](https://design-system.service.gov.uk/components/details/). Radios select one option; checkboxes allow multiple options. Use Email address for an email question, Back for previous-page navigation and Continue between question pages. Authored custom navigation labels are preserved.

**Conditional logic**, **Form registry**, **Grouped checkboxes** and **Result page** are product terms. Conditional logic owns answer-dependent actions; registry entries create independent editable copies; Grouped checkboxes groups related options into categories; a Result page presents a calculator outcome. These are not additional GOV.UK pattern names.

Use sentence case. Mark optional questions with “(optional)” and leave required questions unmarked, following the [question-page pattern](https://design-system.service.gov.uk/patterns/question-pages/). Keep labels visible; editor placeholders do not replace respondent labels. See [text input guidance](https://design-system.service.gov.uk/components/text-input/#avoid-placeholder-text).

Use `type="confirmation"` in Markdown, `role: "confirmation"` in native JSON and `confirmation` for the editor setting. There are no alternative names for this page purpose. Unsupported page encodings are rejected, with original drafts retained for recovery.
