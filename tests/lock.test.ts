import {beforeEach, describe, expect, it, vi} from 'vitest'

type Dict = Record<string, unknown>

const boot = () => {
  const local: Dict = {}

  ;(globalThis as any).chrome = {
    storage: {
      local: {
        get: async (key?: string | null): Promise<Dict> => {
          if (key === undefined || key === null) return {...local}

          return key in local ? {[key]: local[key]} : {}
        },
        set: async (items: Dict) => {
          Object.assign(local, items)
        },
        remove: async (key: string) => {
          delete local[key]
        }
      }
    }
  }
  delete (globalThis as any).browser
  vi.resetModules()

  return {local}
}

const load = () => import('../src/settings/lock')

beforeEach(() => {
  vi.resetModules()
})

describe('passcode storage', () => {
  it('reports no passcode before one is set', async () => {
    boot()
    const lock = await load()

    expect(await lock.hasPasscode()).toBe(false)
    expect(await lock.loadLockState()).toEqual({enabled: false, retryAt: null})
    // Nothing to unlock when no passcode exists.
    expect(await lock.verifyPasscode('0000')).toEqual({ok: true})
  })

  it('stores only hashes, never the passcode or the code', async () => {
    const {local} = boot()
    const lock = await load()
    const {code} = await lock.setPasscode('4821')
    const stored = JSON.stringify(local)

    expect(stored).not.toContain('4821')
    expect(stored).not.toContain(code.replace(/-/g, ''))
    expect(local.passcode).toMatchObject({iterations: expect.any(Number), attempts: 0})
  })

  it('accepts the right passcode and rejects the wrong one', async () => {
    boot()
    const lock = await load()

    await lock.setPasscode('4821')

    expect(await lock.verifyPasscode('4821')).toEqual({ok: true})
    expect(await lock.verifyPasscode('4822')).toEqual({ok: false, reason: 'wrong'})
    expect(await lock.loadLockState()).toMatchObject({enabled: true})
  })

  it('rejects anything that is not 4 to 12 digits', async () => {
    boot()
    const lock = await load()

    expect(lock.isValidPin('123')).toBe(false)
    expect(lock.isValidPin('abcd')).toBe(false)
    expect(lock.isValidPin('1234567890123')).toBe(false)
    expect(lock.isValidPin(' 4821 ')).toBe(true)
    await expect(lock.setPasscode('123')).rejects.toThrow(/4 to 12 digits/)
  })

  it('locks out for a while after five wrong attempts', async () => {
    boot()
    const lock = await load()

    await lock.setPasscode('4821')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await lock.verifyPasscode('0000')).toEqual({ok: false, reason: 'wrong'})
    }

    const locked = await lock.verifyPasscode('4821')

    expect(locked.ok).toBe(false)
    expect(locked).toMatchObject({reason: 'locked'})
    expect((locked as {retryAt: number}).retryAt).toBeGreaterThan(Date.now())
    expect(await lock.loadLockState()).toMatchObject({enabled: true, retryAt: expect.any(Number)})
  })

  it('formats the backup code in four groups of four', async () => {
    boot()
    const lock = await load()
    const {code} = await lock.setPasscode('4821')

    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
  })

  it('accepts the backup code however it is typed and then turns the passcode off', async () => {
    const {local} = boot()
    const lock = await load()
    const {code} = await lock.setPasscode('4821')
    const messy = ` ${code.toLowerCase().replace(/-/g, ' ')} `

    expect(await lock.useRecoveryCode(messy)).toEqual({ok: true})
    expect(await lock.hasPasscode()).toBe(false)
    expect(local.passcode).toBeUndefined()
  })

  it('rejects a wrong backup code and counts it as an attempt', async () => {
    const {local} = boot()
    const lock = await load()

    await lock.setPasscode('4821')

    expect(await lock.useRecoveryCode('ZZZZ-ZZZZ-ZZZZ-ZZZZ')).toEqual({
      ok: false,
      reason: 'wrong'
    })
    expect((local.passcode as {attempts: number}).attempts).toBe(1)
  })

  it('replacing the backup code stops the old one working and keeps the passcode', async () => {
    boot()
    const lock = await load()
    const first = await lock.setPasscode('4821')
    const second = await lock.regenerateRecoveryCode()

    expect(second.code).not.toBe(first.code)
    expect(await lock.useRecoveryCode(first.code)).toEqual({ok: false, reason: 'wrong'})
    expect(await lock.verifyPasscode('4821')).toEqual({ok: true})
    expect(await lock.useRecoveryCode(second.code)).toEqual({ok: true})
  })

  it('clears the passcode on request', async () => {
    boot()
    const lock = await load()

    await lock.setPasscode('4821')
    await lock.disablePasscode()

    expect(await lock.hasPasscode()).toBe(false)
    expect(await lock.verifyPasscode('4821')).toEqual({ok: true})
  })
})
