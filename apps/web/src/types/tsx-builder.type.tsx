import {
  Primitive,
  TextAreaPrimitive,
  DatePrimitive,
  TelPrimitive,
  EmailPrimitive,
  CheckboxPrimitive,
  RadioPrimitive,
  FilePrimitive,
  SelectPrimitive,
} from "@govtech-bb/form-types";

interface ITSXBuilder {
  createTextField(props: Primitive): React.FC;
  createNumberField(props: Primitive): React.FC;
  createTextAreaField(props: TextAreaPrimitive): React.FC;
  createDateField(props: DatePrimitive): React.FC;
  createTelField(props: TelPrimitive): React.FC;
  createEmailField(props: EmailPrimitive): React.FC;
  createCheckboxField(props: CheckboxPrimitive): React.FC;
  createRadioField(props: RadioPrimitive): React.FC;
  createFileField(props: FilePrimitive): React.FC;
  createSelectField(props: SelectPrimitive): React.FC;
}

export type { ITSXBuilder }
