import { Loader } from "./loader";

const sizes = {
  // A screen's whole content: the editor starting, or a service or a page opening. Centred in the height under the
  // workspace's bar, where the page editor will stand, so the window and the workspace show it alike
  page: { frame: "grid min-h-[calc(100dvh-var(--bar-height))] place-items-center", loader: 96 },
  // A dialog's or a panel's body
  section: { frame: "grid place-items-center py-8", loader: 48 },
};

/**
 * The trident Loader, centred where the content will be, at the size of what it stands in for, as EmptyState's sizes
 * are. `label` says what is loading, such as “Loading page…”, to a screen reader.
 */
export function LoadingState({
  label,
  size = "section",
}: {
  label: string;
  size?: keyof typeof sizes;
}) {
  return (
    <div className={sizes[size].frame}>
      <Loader size={sizes[size].loader} label={label} />
    </div>
  );
}
