/** Saves text as a file the browser puts in the user's downloads. */
export function downloadText(name: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], {type}))
  const link = document.createElement('a')

  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
