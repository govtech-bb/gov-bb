import {
  cn,
  Link as GovLink,
  linkVariants,
  Logo,
  OfficialBanner,
} from "@govtech-bb/react";
import { TridentAvatar } from "#/components/trident-avatar";
import { LANDING_URL } from "#/config/landing";

// Official-government banner + brand header. Static; no interactivity yet.
export function SiteHeader() {
  return (
    <div>
      <OfficialBanner
        imageSrc="/images/coat-of-arms.png"
        imageAlt=""
        showLearnMore={false}
      />
      <header className="bg-yellow-100">
        <div className="container py-s md:py-m">
          <a href={LANDING_URL} aria-label="Go to the alpha.gov.bb homepage">
            <Logo aria-hidden="true" width="auto" className="h-7 w-auto md:h-9" />
          </a>
        </div>
      </header>
    </div>
  );
}

// Conversation header: a "Close" link back to the landing site, the bot avatar,
// and a "Start again" control (with persistence on, the only way to drop
// restored history and begin fresh). Mirrors the old app's header.
export function ChatHeader({ onStartAgain }: { onStartAgain: () => void }) {
  return (
    <header className="bg-white-00">
      <div className="container flex items-center gap-s py-xm">
        <div className="flex-1">
          <GovLink href={LANDING_URL}>Close</GovLink>
        </div>
        <TridentAvatar size="sm" tone="filled" />
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={onStartAgain}
            className={cn(linkVariants())}
          >
            Start again
          </button>
        </div>
      </div>
    </header>
  );
}
