import { Header } from "@govtech-bb/react";
import { LANDING_URL } from "../config/landing";

export function SiteHeader() {
  return (
    <Header
      className="no-print"
      homeHref={LANDING_URL}
      homeLabel="Go to the alpha.gov.bb homepage"
    />
  );
}
