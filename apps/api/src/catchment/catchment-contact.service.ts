import { Injectable } from "@nestjs/common";
import { CatchmentContactRepository } from "./catchment-contact.repository";

/**
 * Reads the Environmental Health notification inbox for a serving catchment
 * from `catchment_contact`.
 *
 * Read at send time rather than at submission time, so an inbox rotated while a
 * submission sits on the queue delivers to the new address, and no Ministry
 * address is ever written into a queue message.
 *
 * No caching, for the same reason `FormConfigService` doesn't: these addresses
 * are mutable — an inbox gets rotated — and MDA sends are low-volume, so a
 * stale cache is a worse trade than one indexed lookup per send.
 */
@Injectable()
export class CatchmentContactService {
  constructor(private readonly repo: CatchmentContactRepository) {}

  /**
   * Resolves the private inbox for one serving catchment. Returns `null` when
   * the catchment has no row or its address is blank — the caller fails that
   * one email loudly (NO_RECIPIENT, non-retryable, logged) rather than
   * misrouting it.
   */
  async resolveMdaEmail(catchmentName: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { catchmentName } });
    const email = row?.mdaEmail;
    return typeof email === "string" && email.length > 0 ? email : null;
  }
}
