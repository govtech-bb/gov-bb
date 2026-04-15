"use client";

import { fetchContract } from "@web/lib";
import FormRenderer from "./form-renderer";

export default function Form({ id }: { id: string }) {
  const contract = fetchContract(id);

  return (
    <>
      <h1>Form {id}</h1>
      <FormRenderer contract={contract} />
    </>
  );
}
