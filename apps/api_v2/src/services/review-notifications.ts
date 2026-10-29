import type { ContentStoreUnavailable, PageId } from "../modules/page";
import { ok, type Result } from "../modules/result";

/** A review step that tells someone about it (#3267). */
export interface ReviewEvent {
  /** A change now waits for an approver, or an approver published or rejected it. */
  readonly kind: "submitted" | "published" | "rejected";
  readonly pageId: PageId;
  /** The page's title as the change makes it. */
  readonly title: string;
  /** The user id of whoever submitted the change. */
  readonly submittedBy: string;
  /**
   * On a submission, everyone who changed it: none may decide on it, so no
   * approver among them is told it waits for them.
   */
  readonly contributors?: readonly string[];
}

/**
 * Tells people about a review step once it has committed. It never fails:
 * the step has happened whether or not anyone heard about it.
 */
export interface ReviewNotifier {
  notify(event: ReviewEvent): Promise<void>;
}

/** The notifier for an environment with review emails turned off. */
export const NO_REVIEW_NOTIFICATIONS: ReviewNotifier = {
  notify: async () => {},
};

/** One plain-text email to one person. */
export interface Email {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sends an email, or rejects. */
export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Who review emails go to, from the users and roles tables. */
export interface ReviewRecipients {
  /** Every user holding the approver role, with their email. */
  approvers(): Promise<
    Result<
      readonly { readonly id: string; readonly email: string }[],
      ContentStoreUnavailable
    >
  >;
  /** A user's email, or null when their account is gone. */
  emailOf(
    userId: string,
  ): Promise<Result<string | null, ContentStoreUnavailable>>;
  /**
   * The entry page of the service a page belongs to: the top of its parent
   * chain, or null when that has no category, so the editor lists no service.
   */
  serviceOf(
    pageId: PageId,
  ): Promise<Result<PageId | null, ContentStoreUnavailable>>;
}

/** Where a failed notification is reported. */
export interface FailureLog {
  error(details: Record<string, unknown>, message: string): void;
}

/** A title on one line, as a subject line needs it. */
const oneLine = (title: string) => title.replace(/\s+/g, " ").trim();

/**
 * The email a review step sends: the page's title and a link to the editor,
 * never the page's content.
 */
export function reviewEmail(
  event: ReviewEvent,
  link: string,
): Omit<Email, "to"> {
  const title = oneLine(event.title);
  switch (event.kind) {
    case "submitted":
      return {
        subject: `A change to "${title}" is waiting for review`,
        text: [
          `A change to the page "${title}" is waiting for review.`,
          `Review it in the editor:\n${link}`,
          "You get this email because you are an approver.",
        ].join("\n\n"),
      };
    case "published":
      return {
        subject: `Your change to "${title}" is live`,
        text: [
          `An approver published your change to the page "${title}". People can now see it on the website.`,
          `Open the page in the editor:\n${link}`,
        ].join("\n\n"),
      };
    case "rejected":
      return {
        subject: `Your change to "${title}" was rejected`,
        text: [
          `An approver rejected your change to the page "${title}". The website has not changed.`,
          `Read their comment and update your change in the editor:\n${link}`,
        ].join("\n\n"),
      };
    default: {
      const unexpected: never = event.kind;
      throw new Error(`No review email for ${String(unexpected)}`);
    }
  }
}

/**
 * Review emails (#3267): when a change is submitted, every approver but the
 * submitter hears it waits for them; when it is published or rejected, the
 * submitter hears what happened. A failed lookup or send is logged and
 * dropped, so it never undoes or fails the review step.
 */
export class ReviewNotifications implements ReviewNotifier {
  /** The root supplies the mailer, recipient lookups, the editor's origin and the log. */
  constructor(
    private readonly mailer: Mailer,
    private readonly recipients: ReviewRecipients,
    private readonly editorOrigin: string,
    private readonly log: FailureLog,
  ) {}

  async notify(event: ReviewEvent): Promise<void> {
    const failed = (failure: string, error: unknown) =>
      // The error's name only: a provider's message can quote the address.
      this.log.error(
        {
          failure,
          event: event.kind,
          pageId: event.pageId,
          error: error instanceof Error ? error.name : typeof error,
        },
        "review email not sent",
      );
    try {
      const to = await this.addressees(event);
      if (!to.ok) return failed("recipients_unavailable", to.error);
      if (to.value.length === 0) return;
      const link = await this.linkFor(event);
      if (!link.ok) return failed("link_unavailable", link.error);
      const email = reviewEmail(event, link.value);
      const sent = await Promise.allSettled(
        to.value.map((address) => this.mailer.send({ ...email, to: address })),
      );
      for (const result of sent)
        if (result.status === "rejected") failed("send_failed", result.reason);
    } catch (error) {
      failed("notify_failed", error);
    }
  }

  /** Approvers other than the submitter for a submission; otherwise the submitter. */
  private async addressees(
    event: ReviewEvent,
  ): Promise<Result<string[], ContentStoreUnavailable>> {
    if (event.kind === "submitted") {
      const approvers = await this.recipients.approvers();
      return approvers.ok
        ? ok(
            approvers.value
              .filter(
                ({ id }) =>
                  id !== event.submittedBy && !event.contributors?.includes(id),
              )
              .map(({ email }) => email),
          )
        : approvers;
    }
    const email = await this.recipients.emailOf(event.submittedBy);
    return email.ok ? ok(email.value === null ? [] : [email.value]) : email;
  }

  /**
   * The editor's review screen for a change waiting for review; otherwise the
   * page's own screen, which shows a rejection's comment. A page in no
   * service has no screen of its own, so a rejection links to its review
   * screen, which shows the comment too, and a publication to the services.
   */
  private async linkFor(
    event: ReviewEvent,
  ): Promise<Result<string, ContentStoreUnavailable>> {
    const page = encodeURIComponent(event.pageId);
    if (event.kind === "submitted")
      return ok(`${this.editorOrigin}/reviews/${page}`);
    const service = await this.recipients.serviceOf(event.pageId);
    if (!service.ok) return service;
    if (service.value !== null)
      return ok(
        `${this.editorOrigin}/services/${encodeURIComponent(service.value)}/${page}`,
      );
    return ok(
      event.kind === "rejected"
        ? `${this.editorOrigin}/reviews/${page}`
        : `${this.editorOrigin}/services`,
    );
  }
}
