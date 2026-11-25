import { createContext } from 'react'
import type { PageRecords } from '../../lib/api-v2-collections'

/** The records this page's contact blocks and facts name, read by the route's loader. */
export const PageRecordsContext = createContext<PageRecords>({})
