import { LANDING_URL } from "../config/landing";
import { ErrorPage } from "./error-page";

export default function NotFound() {
  return (
    <ErrorPage
      title="We couldn't find that page"
      intro="The page you're looking for may have been moved, removed, or the address may have been typed incorrectly."
      suggestions={[
        "Check the web address for typos",
        "Return to the homepage",
        "Browse our service directory",
      ]}
      secondary={{
        label: "Browse our service directory",
        href: `${LANDING_URL}/services`,
      }}
      primary={{ label: "Return to homepage", href: LANDING_URL }}
    />
  );
}
