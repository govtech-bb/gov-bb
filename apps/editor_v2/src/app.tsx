import { IconContext } from "@phosphor-icons/react";
import { TipProvider } from "./ui/tooltip";
import { ServiceWorkspace } from "./workspace/workspace";

const icons = { weight: "bold" as const };

export function App() {
  return (
    <IconContext.Provider value={icons}>
      <TipProvider delay={300}>
        <ServiceWorkspace />
      </TipProvider>
    </IconContext.Provider>
  );
}
