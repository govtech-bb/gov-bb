import logo from "@govtech-bb/frontend/assets/images/govbb-logo.svg?raw";
import { cn } from "../cn";

const fits = {
  height: "[&>svg]:h-full [&>svg]:w-auto",
  width: "[&>svg]:h-auto [&>svg]:w-full",
};

/** Labels the bundled SVG as one image. Set its width or height through `className` and the matching `fit`. */
export function GovbbLogo({ fit, className }: { fit: keyof typeof fits; className?: string }) {
  return (
    <span
      role="img"
      aria-label="GovBB"
      className={cn(fits[fit], className)}
      dangerouslySetInnerHTML={{ __html: logo }}
    />
  );
}
