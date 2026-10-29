/**
 * The E2E test inbox: SES receives mail for a test subdomain and writes each
 * message, as raw MIME, to an S3 bucket. Tests send to an address on that
 * subdomain and read the message back here, so no email reaches a real person.
 *
 * Required env:
 *   E2E_INBOX_DOMAIN  the receiving subdomain, e.g. inbox.example.gov.bb
 *   E2E_INBOX_BUCKET  the bucket SES writes to
 *   E2E_INBOX_PREFIX  the key prefix SES writes under (may be empty)
 * plus AWS credentials and region (the default AWS SDK chain).
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import PostalMime from "postal-mime";

export interface InboxEmail {
  subject: string;
  text: string;
  html: string;
  links: string[];
}

const POLL_MS = 5_000;
// S3's LastModified and this machine's clock can disagree a little.
const CLOCK_SKEW_MS = 60_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`The test inbox needs ${name} to be set`);
  return value;
}

/** A fresh address on the test subdomain, unique to this run. */
export function testInboxAddress(tag: string): string {
  return `e2e+${tag}-${Date.now()}@${required("E2E_INBOX_DOMAIN")}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

/** Every http(s) link in the text part and the HTML hrefs, de-duplicated. */
function extractLinks(text: string, html: string): string[] {
  const links = [
    ...(text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []),
    ...[...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map((m) => decodeEntities(m[1]))
      .filter((href) => /^https?:\/\//.test(href)),
  ];
  return [...new Set(links)];
}

/**
 * Poll the inbox bucket until a message to `to` (and, if given, with a subject
 * containing `subjectIncludes`) that arrived after `since` shows up.
 */
export async function waitForEmail(opts: {
  to: string;
  subjectIncludes?: string;
  since: Date;
  timeoutMs?: number;
}): Promise<InboxEmail> {
  const bucket = required("E2E_INBOX_BUCKET");
  const prefix = process.env.E2E_INBOX_PREFIX ?? "";
  const to = opts.to.toLowerCase();
  const after = opts.since.getTime() - CLOCK_SKEW_MS;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  const s3 = new S3Client({});
  // Keys already read and found not to match, so each poll only fetches new mail.
  const seen = new Set<string>();

  try {
    while (true) {
      let token: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? []) {
          const key = object.Key;
          if (!key || seen.has(key)) continue;
          if ((object.LastModified?.getTime() ?? 0) < after) continue;
          seen.add(key);

          const body = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: key }),
          );
          if (!body.Body) continue;
          const email = await PostalMime.parse(
            await body.Body.transformToByteArray(),
          );
          const recipients = (email.to ?? [])
            .flatMap((a) => a.group ?? [a])
            .map((a) => a.address.toLowerCase());
          if (!recipients.includes(to)) continue;
          const subject = email.subject ?? "";
          if (opts.subjectIncludes && !subject.includes(opts.subjectIncludes)) {
            continue;
          }
          const text = email.text ?? "";
          const html = email.html ?? "";
          return { subject, text, html, links: extractLinks(text, html) };
        }
        token = page.NextContinuationToken;
      } while (token);

      if (Date.now() >= deadline) {
        throw new Error(
          `No email to ${opts.to}` +
            (opts.subjectIncludes ? ` with "${opts.subjectIncludes}"` : "") +
            ` reached s3://${bucket}/${prefix} in time`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  } finally {
    s3.destroy();
  }
}
