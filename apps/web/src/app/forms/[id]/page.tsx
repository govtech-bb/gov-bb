import { Form } from "@web/components";
import * as React from "react";

export default async function Page({ params }: { params: { id: string } }) {
  // Await is necessary, else it breaks.
  const { id } = await params;
  return (
      <Form id={id} />
  );
}
