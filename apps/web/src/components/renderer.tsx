import { FormMeta, FormRendererProps } from "@web/types";
import { buildForm } from "@web/lib";

export default async function FormRenderer({ contract }: FormRendererProps) {
  const formMeta: FormMeta = await buildForm(contract);

  return (
    <>
      <h2> {formMeta.formTitle} </h2>
      <p> {formMeta.formDescription} </p>
    </>
  );
}
