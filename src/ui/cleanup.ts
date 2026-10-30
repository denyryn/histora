import type {SweepResult} from '../history/sweep'

/** Plain summary of the immediate cleanup that follows a new rule. */
export function cleanupNote(result: SweepResult | undefined): string {
  if (!result) return 'Rule added. History is cleaned at the next sweep.'

  if (result.skipped === 'paused') {
    return 'Rule added. Removal is paused, so nothing was removed yet.'
  }

  if (result.skipped === 'locked') {
    return 'Rule added. A cleanup is already running; the next sweep will handle it.'
  }

  const removed =
    result.deleted === 0
      ? 'No entries were removed.'
      : result.deleted === 1
        ? 'Removed 1 entry from history.'
        : `Removed ${result.deleted} entries from history.`

  const failed =
    result.failed === 0
      ? []
      : [result.failed === 1 ? '1 entry could not be removed.' : `${result.failed} entries could not be removed.`]

  const rest = result.stopped ? ['The rest will be removed at the next sweep.'] : []

  return ['Rule added.', removed, ...failed, ...rest].join(' ')
}
