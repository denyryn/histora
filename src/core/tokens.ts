import {type ParsedUrl} from './normalize'

/**
 * Tokens a `keyword` rule can equal: host labels, path segments, and query
 * keys and values. Encoded forms are tokenized alongside their decoded form so
 * a keyword typed in native script matches an encoded URL.
 */
export function urlTokens(parsed: ParsedUrl): Set<string> {
  const tokens = new Set<string>()

  const add = (value: string) => {
    if (value) tokens.add(value.toLowerCase())
  }

  for (const label of parsed.host.split('.')) add(label)

  for (const segment of parsed.path.split('/')) add(segment)

  if (parsed.pathDecoded) {
    for (const segment of parsed.pathDecoded.split('/')) add(segment)
  }

  for (const part of parsed.search.split(/[&=]/)) {
    add(part)

    try {
      add(decodeURIComponent(part))
    } catch {
      // Keep the raw token only when this one cannot be decoded.
    }
  }

  return tokens
}
