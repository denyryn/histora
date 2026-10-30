export type ParsedUrl = {
  /** Absolute URL as the browser normalized it. */
  href: string
  scheme: 'http:' | 'https:'
  /** Lowercase, punycode, no trailing dot, no port. */
  host: string
  /** Leading slash, no trailing slash except root. */
  path: string
  /** Decoded path, or null when the path is not valid percent-encoding. */
  pathDecoded: string | null
  /** Raw query without the leading `?`. */
  search: string
}

const MATCHED_SCHEMES = new Set(['http:', 'https:'])

/**
 * Parses a URL into the parts the matcher compares.
 * Returns null for anything that is not an http(s) URL.
 */
export function parseUrl(input: string): ParsedUrl | null {
  let url: URL

  try {
    url = new URL(input)
  } catch {
    return null
  }

  if (!MATCHED_SCHEMES.has(url.protocol)) return null

  const path = normalizePath(url.pathname)

  return {
    href: url.href,
    scheme: url.protocol as 'http:' | 'https:',
    host: normalizeHost(url.hostname),
    path,
    pathDecoded: decodePath(path),
    search: url.search.replace(/^\?/, '')
  }
}

/** Lowercase, punycode, no trailing dot. Brackets on IPv6 are kept. */
export function normalizeHost(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * Accepts a bare host, a host with a path, or a full URL, and returns the host.
 * Returns null when nothing host-like survives.
 */
export function hostFromInput(input: string): string | null {
  const raw = input.trim()

  if (!raw) return null

  const parsed = parseUrl(raw.includes('://') ? raw : `http://${raw}`)

  if (parsed) return parsed.host

  // Bare hosts that the URL parser refuses, e.g. "example" with no dot.
  const bare = raw.split(/[/?#]/)[0]

  if (!bare || !/^[a-z0-9.\-_]+$/i.test(bare)) return null

  return normalizeHost(bare)
}

/** Leading slash, no trailing slash except root, no dot segments. */
export function normalizePath(input: string): string {
  let path = input.trim()

  if (!path.startsWith('/')) path = `/${path}`

  path = path.replace(/\/{2,}/g, '/')

  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  return path || '/'
}

/** Path with percent-encoding resolved, or null when it cannot be decoded. */
export function decodePath(path: string): string | null {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}
