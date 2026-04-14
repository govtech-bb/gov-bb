import { Form } from "@web/components";
import { fetchContract } from "@web/lib";
import { designSystem } from "apps/web/src/lib/design-system";
import * as React from "react";

export default async function Page({ params }: { params: { id: string } }) {
  // Await is necessary, else it breaks.
  const { id } = await params;
  return (
    <div className={designSystem.formRoot}>
      <Form id={id} />
    </div>
  );
}
