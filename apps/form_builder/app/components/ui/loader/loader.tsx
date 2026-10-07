/** Loader size variant definitions mapping sizes to their pixel values. */
export type LoaderSize = "sm" | "base" | "lg";
const sizes = { sm: 16, base: 24, lg: 32 };
export interface LoaderProps {
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  size?: LoaderSize | number;
  /**
   * Accessible label for the loader, announced by screen readers.
   * Pass a translated string for internationalization.
   * @default "Loading"
   */
  "aria-label"?: string;
}
export const Loader = ({
  className,
  size = "base",
  "aria-label": ariaLabel = "Loading",
}: LoaderProps) => {
  const sizeValue = typeof size === "number" ? size : sizes[size];
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      className={["ui-loader", className].filter(Boolean).join(" ")}
      style={{ height: sizeValue, width: sizeValue }}
      role="status"
      aria-label={ariaLabel}
    >
      <circle
        className="ui-loader-ring"
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        opacity={0.1}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};
