/**
 * The PGlite leader. One instance serves every tab, so the editor in one tab
 * and the site in another share a single IndexedDB-backed database rather
 * than opening two connections to the same directory.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { live } from '@electric-sql/pglite/live'
import { worker } from '@electric-sql/pglite/worker'

worker({
  async init() {
    return new PGlite({
      dataDir: 'idb://gov-bb-block-editor-spike',
      // pgcrypto is not in PGlite's base build; the DDL's
      // `create extension pgcrypto` fails without it loaded here.
      extensions: { live, pgcrypto },
    })
  },
})
