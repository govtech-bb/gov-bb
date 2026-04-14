import { ClientServiceContract, FormMeta, FormRendererProps } from "@web/types";
import { buildForm } from "@web/lib";

export default function FormRenderer({ contract }: FormRendererProps) {
  const formMeta: FormMeta = buildForm(contract);

  return (
    <>
      <h2> {formMeta.formTitle} </h2>
      <p> {formMeta.formTitle} </p>
    </>
  );
}
