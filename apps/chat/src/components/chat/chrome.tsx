import { Link } from "@tanstack/react-router";
import {
  cn,
  Link as GovLink,
  linkVariants,
  Logo,
  Text,
} from "@govtech-bb/react";
import { TridentAvatar } from "#/components/trident-avatar";

const LANDING_URL =
  import.meta.env.VITE_LANDING_URL || "https://landing.sandbox.alpha.gov.bb";

export function SiteHeader() {
  return (
    <div>
      <div className="bg-blue-100 text-white-00">
        <div className="container flex items-center gap-xs py-xs">
          <img
            alt=""
            aria-hidden="true"
            className="block"
            height={16}
            src="/coat-of-arms.png"
            width={17}
          />
          <Text as="span" className="text-white-00" size="caption">
            Official government website
          </Text>
        </div>
      </div>
      <header className="bg-yellow-100">
        <div className="container py-s md:py-m">
          <Link to="/" aria-label="Go to the alpha.gov.bb homepage">
            <Logo
              aria-hidden="true"
              width="auto"
              className="h-7 w-auto md:h-9"
            />
          </Link>
        </div>
      </header>
    </div>
  );
}

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
