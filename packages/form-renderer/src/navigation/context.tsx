import { createContext, useContext, type ReactNode } from "react";

export interface FormNavigation {
  /** Navigate to a step within the current form (host maps stepId → URL). */
  goToStep(stepId: string): void;
}

const FormNavigationContext = createContext<FormNavigation | null>(null);

export function FormNavigationProvider({
  navigation,
  children,
}: {
  navigation: FormNavigation;
  children: ReactNode;
}) {
  return (
    <FormNavigationContext.Provider value={navigation}>
      {children}
    </FormNavigationContext.Provider>
  );
}

export function useFormNavigation(): FormNavigation {
  const ctx = useContext(FormNavigationContext);
  if (!ctx) {
    throw new Error(
      "useFormNavigation must be used within a FormNavigationProvider",
    );
  }
  return ctx;
}
