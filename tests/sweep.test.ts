import {describe, expect, it} from 'vitest'
import {resumeFrom, windowsFrom} from '../src/history/sweep'

const DAY = 86_400_000
const NOW = 1_700_000_000_000

describe('windowsFrom', () => {
  it('starts at now and walks backwards in contiguous 7-day chunks', () => {
    const windows = windowsFrom(NOW, 90)

    expect(windows[0]).toEqual({start: NOW - 7 * DAY, end: NOW})

    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index].end).toBe(windows[index - 1].start)
    }
  })

  it('covers 90 days in 13 windows', () => {
    const windows = windowsFrom(NOW, 90)

    expect(windows).toHaveLength(13)
    expect(windows[windows.length - 1].start).toBe(NOW - 90 * DAY)
  })

  it('treats 0 days as all of history', () => {
    const windows = windowsFrom(NOW, 0)

    expect(windows[windows.length - 1].start).toBe(0)
    expect(windows).toHaveLength(Math.ceil(NOW / (7 * DAY)))
  })

  it('never produces a window in the future or a negative start', () => {
    for (const window of windowsFrom(1000, 90)) {
      expect(window.start).toBeGreaterThanOrEqual(0)
      expect(window.end).toBeGreaterThan(window.start)
    }
  })
})

describe('resumeFrom', () => {
  it('returns every window when there is no cursor', () => {
    const windows = windowsFrom(NOW, 90)

    expect(resumeFrom(windows, null)).toHaveLength(windows.length)
  })

  it('resumes at the window a stopped run was working on, not after it', () => {
    const windows = windowsFrom(NOW, 90)
    const stoppedIn = windows[2]

    const resumed = resumeFrom(windows, stoppedIn.start)

    expect(resumed[0]).toEqual(stoppedIn)
    expect(resumed).toHaveLength(windows.length - 2)
  })
})
