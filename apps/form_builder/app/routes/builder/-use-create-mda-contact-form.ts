import { useState } from "react";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";

export interface CreateMdaContactFields {
  label: string;
  title: string;
  telephone: string;
  email: string;
  mdaEmail: string;
  line1: string;
  line2: string;
  city: string;
  country: string;
}

export interface CreateMdaContactForm {
  values: CreateMdaContactFields;
  setValue: (key: keyof CreateMdaContactFields, value: string) => void;
  isCreating: boolean;
  createError: string | null;
  clearError: () => void;
  /**
   * Build the create input from the current fields and POST it. On success the
   * fields are reset and the created contact is returned; on failure the error
   * is recorded and `null` is returned (the caller keeps the form open).
   */
  create: () => Promise<MdaContact | null>;
}

const EMPTY: CreateMdaContactFields = {
  label: "",
  title: "",
  telephone: "",
  email: "",
  mdaEmail: "",
  line1: "",
  line2: "",
  city: "",
  country: "",
};

/**
 * Owns the "Create new MDA contact" form state (issue #607): the nine input
 * fields plus the in-flight / error flags. Extracted from ContactDetailsEditor
 * unchanged — the create-and-select orchestration stays with the caller.
 */
export function useCreateMdaContactForm(
  onCreateContact: (input: CreateMdaContactInput) => Promise<MdaContact>,
): CreateMdaContactForm {
  const [values, setValues] = useState<CreateMdaContactFields>(EMPTY);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function setValue(key: keyof CreateMdaContactFields, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function create(): Promise<MdaContact | null> {
    const hasNewAddress = [
      values.line1,
      values.line2,
      values.city,
      values.country,
    ].some((v) => v.trim() !== "");
    const input: CreateMdaContactInput = {
      label: values.label.trim(),
      title: values.title.trim(),
      telephone: values.telephone.trim(),
      email: values.email.trim(),
      mdaEmail: values.mdaEmail.trim(),
      ...(hasNewAddress
        ? {
            address: {
              line1: values.line1.trim(),
              ...(values.line2.trim() ? { line2: values.line2.trim() } : {}),
              city: values.city.trim(),
              ...(values.country.trim()
                ? { country: values.country.trim() }
                : {}),
            },
          }
        : {}),
    };
    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await onCreateContact(input);
      // Reset the create form for next time.
      setValues(EMPTY);
      return created;
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Failed to create MDA contact",
      );
      return null;
    } finally {
      setIsCreating(false);
    }
  }

  return {
    values,
    setValue,
    isCreating,
    createError,
    clearError: () => setCreateError(null),
    create,
  };
}
