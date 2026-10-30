import { createRoot } from "react-dom/client";
import { Field } from "../../src/ui/field";
import { Input } from "../../src/ui/input";
import { NativeSelect } from "../../src/ui/native-select";
import { Textarea } from "../../src/ui/textarea";
import "../../index.css";

const host = document.getElementById("app");

if (!host) throw new Error("Field focus fixture needs its mount point");

createRoot(host).render(
  <form aria-label="Page settings" className="mx-auto grid max-w-md gap-6 p-6">
    <Field label="Visibility">
      <NativeSelect defaultValue="preview">
        <option value="preview">Preview link only</option>
        <option value="public">Public</option>
      </NativeSelect>
    </Field>
    <Field label="Description">
      <Textarea defaultValue="Apply for a permit" rows={3} />
    </Field>
    <Field label="Form ID">
      <Input defaultValue="permit-application" />
    </Field>
  </form>,
);
