import {api} from '../history/api'

const KEY = 'settings'

export type Settings = {
  paused: boolean
  /** Days of history the sweep looks back over. 0 means everything. */
  sweepWindowDays: number
  shownOnboarding: boolean
  lastSweepAt: number | null
  /** Start of the window the last run stopped at, so the next one resumes. */
  cursorStart: number | null
  lockAt: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  paused: false,
  sweepWindowDays: 90,
  shownOnboarding: false,
  lastSweepAt: null,
  cursorStart: null,
  lockAt: null
}

export async function loadSettings(): Promise<Settings> {
  const stored = await api.storage.local.get(KEY)

  return {...DEFAULT_SETTINGS, ...(stored?.[KEY] ?? {})}
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = {...(await loadSettings()), ...patch}

  await api.storage.local.set({[KEY]: next})

  return next
}
