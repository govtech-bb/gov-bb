import { createContext, useContext, type ReactNode } from "react";
import type { FormTransport } from "./types";

const FormTransportContext = createContext<FormTransport | null>(null);

export function FormTransportProvider({
  transport,
  children,
}: {
  transport: FormTransport;
  children: ReactNode;
}) {
  return (
    <FormTransportContext.Provider value={transport}>
      {children}
    </FormTransportContext.Provider>
  );
}

export function useFormTransport(): FormTransport {
  const ctx = useContext(FormTransportContext);
  if (!ctx) {
    throw new Error(
      "useFormTransport must be used within a FormTransportProvider",
    );
  }
  return ctx;
}
