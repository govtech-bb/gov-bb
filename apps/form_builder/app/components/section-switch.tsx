import { useNavigate } from "@tanstack/react-router";
import { Tabs } from "../component/ui/tabs";

const SECTIONS = [
  { value: "builder", label: "Builder" },
  { value: "content", label: "Content" },
];

type SectionKey = "builder" | "content";

export function SectionSwitch({
  current,
  onBeforeNavigate,
}: {
  current: SectionKey;
  /** Veto hook for the leaving section (e.g. unsaved-changes confirm). */
  onBeforeNavigate?: () => boolean | Promise<boolean>;
}) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Section">
      <Tabs
        tabs={SECTIONS}
        value={current}
        onValueChange={async (key) => {
          if (key === current) return;
          if (onBeforeNavigate && !(await onBeforeNavigate())) return;
          void navigate({ to: key === "builder" ? "/builder" : "/content" });
        }}
      />
    </nav>
  );
}
