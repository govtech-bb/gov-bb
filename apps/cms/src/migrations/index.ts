import * as migration_20260528_090649 from './20260528_090649'
import * as migration_20260528_103403 from './20260528_103403'
import * as migration_20260528_113413 from './20260528_113413'

export const migrations = [
  {
    up: migration_20260528_090649.up,
    down: migration_20260528_090649.down,
    name: '20260528_090649',
  },
  {
    up: migration_20260528_103403.up,
    down: migration_20260528_103403.down,
    name: '20260528_103403',
  },
  {
    up: migration_20260528_113413.up,
    down: migration_20260528_113413.down,
    name: '20260528_113413',
  },
]
