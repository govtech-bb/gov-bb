import { FormRenderer } from "@web/components";
import { fetchContract } from "@web/lib";
import { designSystem } from "apps/web/src/lib/design-system";

export default function Form({ params }: { params: { id: string } }) {
  const contract = fetchContract(params.id);
  return (
    <div className={designSystem.formRoot}>
      <h1>Form {params.id}</h1>
      <FormRenderer contract={contract} />
    </div>
  );
}
