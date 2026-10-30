import {describe, expect, it} from 'vitest'
import {parseUrl, hostFromInput, normalizePath} from '../src/core/normalize'

describe('parseUrl', () => {
  it('normalizes host case, trailing dot, and default port', () => {
    const parsed = parseUrl('HTTPS://Example.COM.:443/x/')

    expect(parsed?.host).toBe('example.com')
    expect(parsed?.path).toBe('/x')
  })

  it('keeps a non-default port out of the host', () => {
    expect(parseUrl('http://example.com:8080/x')?.host).toBe('example.com')
  })

  it('converts an IDN host to punycode', () => {
    expect(parseUrl('https://münchen.de/straße')?.host).toBe('xn--mnchen-3ya.de')
  })

  it('drops the fragment and the empty path becomes root', () => {
    const parsed = parseUrl('https://site.test#frag')

    expect(parsed?.path).toBe('/')
    expect(parsed?.search).toBe('')
  })

  it('keeps the query without the question mark', () => {
    expect(parseUrl('https://site.test/b?utm=1')?.search).toBe('utm=1')
  })

  it('decodes the path, and reports null when it cannot', () => {
    expect(parseUrl('https://site.test/caf%C3%A9')?.pathDecoded).toBe('/café')
    expect(parseUrl('https://site.test/%E0%A4%A')?.pathDecoded).toBeNull()
  })

  it('refuses every non-http scheme', () => {
    for (const url of [
      'file:///home/u/porn.txt',
      'chrome://history',
      'about:blank',
      'moz-extension://abc/popup.html',
      'javascript:alert(1)'
    ]) {
      expect(parseUrl(url)).toBeNull()
    }
  })
})

describe('hostFromInput', () => {
  it('accepts a bare host, a host with a path, and a full URL', () => {
    expect(hostFromInput('Example.COM')).toBe('example.com')
    expect(hostFromInput('example.com/blog/secret')).toBe('example.com')
    expect(hostFromInput('https://example.com/blog')).toBe('example.com')
  })

  it('refuses things that are not hosts', () => {
    expect(hostFromInput('')).toBeNull()
    expect(hostFromInput('not a host')).toBeNull()
  })
})

describe('normalizePath', () => {
  it('adds a leading slash and strips one trailing slash', () => {
    expect(normalizePath('blog/secret/')).toBe('/blog/secret')
  })

  it('keeps root as root', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })

  it('collapses duplicate slashes and preserves case', () => {
    expect(normalizePath('//Blog//Secret')).toBe('/Blog/Secret')
  })
})
