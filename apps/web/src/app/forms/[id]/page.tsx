import { Form } from "@web/components";

export default async function Page({ params }: { params: { id: string } }) {
  // Await is necessary, else it breaks.
  const { id } = await params;
  return (
      <Form id={id} />
  );
}
