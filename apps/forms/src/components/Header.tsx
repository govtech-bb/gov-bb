import {
  Header as GovHeader,
  Link,
  OfficialBanner,
  StatusBanner,
} from "@govtech-bb/react-next";
import govBbLogoUrl from "@govtech-bb/frontend/assets/images/govbb-logo.svg?url";
import { LANDING_URL } from "../config/landing";

export default function Header() {
  return (
    <>
      <OfficialBanner
        imageSrc="/images/coat-of-arms.png"
        imageAlt=""
        showLearnMore={false}
      />
      <GovHeader
        homeHref={LANDING_URL}
        logoAlt="Go to the alpha.gov.bb homepage"
        logoSrc={govBbLogoUrl}
      />
      <StatusBanner variant="alpha" fullWidth>
        <p>
          This page is in{" "}
          <Link href={`${LANDING_URL}/what-we-mean-by-alpha`}>Alpha</Link>.
        </p>
      </StatusBanner>
    </>
  );
}
