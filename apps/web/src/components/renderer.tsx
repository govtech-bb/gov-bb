import { ClientServiceContract, FormMeta } from "@web/types";
import { buildForm } from "@web/lib";

export default function FormRenderer(schema: ClientServiceContract) {
  const formMeta: FormMeta = buildForm(schema);

  return (
    <h2>Update me! </h2>
  )
}
