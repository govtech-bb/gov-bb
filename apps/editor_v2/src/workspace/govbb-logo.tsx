import logo from "@govtech-bb/frontend/assets/images/govbb-logo.svg?raw";
import { cn } from "../cn";

// What sets its size: a height, as in the app's header, where its width follows; or a width, as on the sign-in screen
const fits = {
  height: "[&>svg]:h-full [&>svg]:w-auto",
  width: "[&>svg]:h-auto [&>svg]:w-full",
};

/**
 * GovBB's wordmark, the design system's own artwork, unchanged: one image named “GovBB”, where the artwork's own
 * title would be read otherwise, for the app's header and the sign-in screen. Its box, through `className`, sizes it
 * along `fit`. The app's own, as the artwork is, rather than the kit's.
 */
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
