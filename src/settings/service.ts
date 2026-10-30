import {loadSettings, saveSettings, type Settings} from '../storage/settings'

const SWEEP_WINDOWS = new Set([0, 30, 90, 365])

export function getSettings(): Promise<Settings> {
  return loadSettings()
}

export function setPaused(paused: boolean): Promise<Settings> {
  return saveSettings({paused})
}

export async function setSweepWindowDays(days: number): Promise<Settings> {
  if (!SWEEP_WINDOWS.has(days)) throw new Error('Choose 0, 30, 90, or 365 days.')

  return saveSettings({sweepWindowDays: days})
}

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await loadSettings()).shownOnboarding
}

export async function markOnboardingSeen(): Promise<void> {
  await saveSettings({shownOnboarding: true})
}
