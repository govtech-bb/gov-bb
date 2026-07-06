import { Link, StatusBanner, Text } from "@govtech-bb/react";

type Props = { stage: "alpha"; url?: string };

const COPY = { prefix: "This page is in ", linkText: "Alpha" };
const DEFAULT_URL = "/what-we-mean-by-alpha";

export function StageBanner(props: Props) {
  const { stage } = props;
  const href = props.url ?? DEFAULT_URL;

  return (
    <StatusBanner className="px-0" variant={stage}>
      <Text as="p">
        {COPY.prefix}
        <Link href={href} variant="secondary">
          {COPY.linkText}
        </Link>
        .
      </Text>
    </StatusBanner>
  );
}
