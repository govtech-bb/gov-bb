import * as migration_20260528_090649 from './20260528_090649'
import * as migration_20260528_103403 from './20260528_103403'

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
]
