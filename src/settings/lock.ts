import {api} from '../history/api'

/**
 * A local gate on the options page, not encryption: the rules and the audit
 * log stay readable in extension storage, and anyone who can clear extension
 * data can remove the passcode. It only stops someone who has this browser
 * open from reading or changing the settings.
 */
const KEY = 'passcode'
const ITERATIONS = 210_000
const MAX_ATTEMPTS = 5
const COOLDOWN_MS = 30_000
const CODE_LENGTH = 16
/** Crockford base32: no I, L, O, U, so 0/O and 1/I/L cannot be confused. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

type Stored = {
  salt: string
  hash: string
  iterations: number
  codeSalt: string
  codeHash: string
  codeIterations: number
  attempts: number
  lockUntil: number | null
}

export type LockState = {enabled: boolean; retryAt: number | null}

export type UnlockResult =
  | {ok: true}
  | {ok: false; reason: 'wrong' | 'locked'; retryAt?: number}

const bytesToB64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))

const b64ToBytes = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

const randomBytes = (length: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(length))

async function derive(secret: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt: b64ToBytes(salt), iterations, hash: 'SHA-256'},
    key,
    256
  )

  return bytesToB64(new Uint8Array(bits))
}

export const isValidPin = (pin: string): boolean => /^\d{4,12}$/.test(pin.trim())

const canonicalCode = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')

const formatCode = (raw: string): string =>
  raw.match(/.{1,4}/g)?.join('-') ?? raw

const generateCode = (): string => {
  const bytes = randomBytes(CODE_LENGTH)

  // 256 % 32 === 0, so the modulo keeps the alphabet uniform.
  return formatCode(
    Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
  )
}

const readStored = async (): Promise<Stored | undefined> => {
  const stored = await api.storage.local.get(KEY)

  return stored?.[KEY] as Stored | undefined
}

const writeStored = (value: Stored): Promise<void> =>
  api.storage.local.set({[KEY]: value})

const clearStored = (): Promise<void> => api.storage.local.remove(KEY)

const nextAttempt = (stored: Stored): Stored => {
  const attempts = stored.attempts + 1

  if (attempts >= MAX_ATTEMPTS) {
    return {...stored, attempts: 0, lockUntil: Date.now() + COOLDOWN_MS}
  }

  return {...stored, attempts, lockUntil: null}
}

const lockedResult = (stored: Stored): UnlockResult | null =>
  stored.lockUntil && stored.lockUntil > Date.now()
    ? {ok: false, reason: 'locked', retryAt: stored.lockUntil}
    : null

export async function loadLockState(): Promise<LockState> {
  const stored = await readStored()

  if (!stored) return {enabled: false, retryAt: null}

  return {
    enabled: true,
    retryAt: stored.lockUntil && stored.lockUntil > Date.now() ? stored.lockUntil : null
  }
}

export async function hasPasscode(): Promise<boolean> {
  return Boolean(await readStored())
}

/** Returns the backup code to show once; only its hash is stored. */
export async function setPasscode(pin: string): Promise<{code: string}> {
  const value = pin.trim()

  if (!isValidPin(value)) throw new Error('Use 4 to 12 digits.')

  const salt = bytesToB64(randomBytes(16))
  const codeSalt = bytesToB64(randomBytes(16))
  const code = generateCode()

  await writeStored({
    salt,
    hash: await derive(value, salt, ITERATIONS),
    iterations: ITERATIONS,
    codeSalt,
    codeHash: await derive(canonicalCode(code), codeSalt, ITERATIONS),
    codeIterations: ITERATIONS,
    attempts: 0,
    lockUntil: null
  })

  return {code}
}

export async function verifyPasscode(pin: string): Promise<UnlockResult> {
  const stored = await readStored()

  if (!stored) return {ok: true}

  const locked = lockedResult(stored)

  if (locked) return locked

  if ((await derive(pin.trim(), stored.salt, stored.iterations)) === stored.hash) {
    if (stored.attempts || stored.lockUntil) await writeStored({...stored, attempts: 0, lockUntil: null})

    return {ok: true}
  }

  await writeStored(nextAttempt(stored))

  return {ok: false, reason: 'wrong'}
}

/** A correct code turns the passcode off, so it cannot become a standing way in. */
export async function useRecoveryCode(input: string): Promise<UnlockResult> {
  const stored = await readStored()

  if (!stored) return {ok: true}

  const locked = lockedResult(stored)

  if (locked) return locked

  const code = canonicalCode(input)

  if (code.length === CODE_LENGTH && (await derive(code, stored.codeSalt, stored.codeIterations)) === stored.codeHash) {
    await clearStored()

    return {ok: true}
  }

  await writeStored(nextAttempt(stored))

  return {ok: false, reason: 'wrong'}
}

export async function regenerateRecoveryCode(): Promise<{code: string}> {
  const stored = await readStored()

  if (!stored) throw new Error('There is no passcode to back up.')

  const codeSalt = bytesToB64(randomBytes(16))
  const code = generateCode()
  const codeHash = await derive(canonicalCode(code), codeSalt, ITERATIONS)

  await writeStored({
    ...stored,
    codeSalt,
    codeHash,
    codeIterations: ITERATIONS
  })

  return {code}
}

export function disablePasscode(): Promise<void> {
  return clearStored()
}
