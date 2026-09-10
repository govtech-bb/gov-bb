import { useCallback, useEffect, useState } from "react";
import { listMdaContacts } from "../../server/mda-contacts";
import type { MdaContact } from "../../types/index";

export interface MdaContactsState {
  /** The MDA contacts, or `null` while the mount fetch is in flight. */
  contacts: MdaContact[] | null;
  /** A message if the mount fetch failed, otherwise `null`. */
  loadError: string | null;
  /** Re-fetch the directory on demand. */
  refetch: () => void;
  /**
   * Patch a single contact into the local list without a server round-trip
   * (replacing the row with the matching id, or appending if absent). The
   * "Create new" flow uses this so the freshly-created contact appears in the
   * dropdown immediately, before the next refetch.
   */
  upsertContact: (contact: MdaContact) => void;
}

/**
 * Fetches the per-environment MDA contact directory once on mount (issue #607),
 * mirroring useFormsList. Used by the contact-details editor's dropdown.
 */
export function useMdaContacts(): MdaContactsState {
  const [contacts, setContacts] = useState<MdaContact[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback((isActive: () => boolean = () => true) => {
    setLoadError(null);
    listMdaContacts()
      .then((result) => {
        if (isActive()) setContacts(result);
      })
      .catch((e) => {
        if (isActive()) {
          setLoadError(
            e instanceof Error ? e.message : "Failed to load MDA contacts",
          );
        }
      });
  }, []);

  const upsertContact = useCallback((contact: MdaContact) => {
    setContacts((current) => {
      const list = current ?? [];
      const index = list.findIndex((c) => c.id === contact.id);
      if (index === -1) return [...list, contact];
      const next = list.slice();
      next[index] = contact;
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  return { contacts, loadError, refetch: () => load(), upsertContact };
}
