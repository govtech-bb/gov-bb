import { useNavigate } from "@tanstack/react-router";
import { SlidingTabs } from "../routes/content/-sliding-tabs";

const SECTIONS = [
  { key: "builder", label: "Builder" },
  { key: "content", label: "Content" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * The Builder ⇄ Content switch shown in both sections' headers — the content
 * CMS's sliding segmented control, navigating instead of toggling local state.
 * Requires `-transitions.css` (the `.cms-tabs` skin) to be loaded by the
 * hosting route.
 */
export function SectionSwitch({
  current,
  onBeforeNavigate,
}: {
  current: SectionKey;
  /** Veto hook for the leaving section (e.g. unsaved-changes confirm). */
  onBeforeNavigate?: () => boolean;
}) {
  const navigate = useNavigate();
  return (
    <SlidingTabs
      options={SECTIONS}
      value={current}
      ariaLabel="Section"
      onChange={(key) => {
        if (key === current) return;
        if (onBeforeNavigate && !onBeforeNavigate()) return;
        void navigate({ to: key === "builder" ? "/builder" : "/content" });
      }}
    />
  );
}
