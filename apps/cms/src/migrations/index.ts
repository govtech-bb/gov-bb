import * as migration_20260528_090649 from './20260528_090649'

export const migrations = [
  {
    up: migration_20260528_090649.up,
    down: migration_20260528_090649.down,
    name: '20260528_090649',
  },
]
