import { Logo } from "@govtech-bb/react";
import { LANDING_URL } from "../config/landing";

export function SiteHeader() {
  return (
    <header className="relative bg-yellow-100">
      <div className="container">
        <div className="flex items-center gap-3 py-4 lg:py-6">
          <a href={LANDING_URL} aria-label="Go to the alpha.gov.bb homepage">
            <Logo aria-hidden="true" className="h-7 w-auto lg:h-9" />
          </a>
        </div>
      </div>
    </header>
  );
}
