import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { legacyPath } from "./workspace/navigation";

if (window.location.pathname === "/") {
  const path = legacyPath(window.location.hash);

  if (path) window.history.replaceState(window.history.state, "", path + window.location.search);
}

// Lexical's typeahead menu resizes its own anchor inside its observer callback.
// ponytail: patches the global; remove when Lexical no longer writes to its observed element.
if (!("govbbTypeaheadDeferred" in window.ResizeObserver)) {
  const NativeResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends NativeResizeObserver {
    static govbbTypeaheadDeferred = true;

    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        if (entries.some((entry) => entry.target.id === "typeahead-menu")) {
          requestAnimationFrame(() => callback(entries, observer));
        } else {
          callback(entries, observer);
        }
      });
    }
  };
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
