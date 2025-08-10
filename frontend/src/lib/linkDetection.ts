const URL_REGEX = /(?:https?:\/\/|www\.|ftp:\/\/)[^\s<>"{}|\\^`[\]]+/gi
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g

export function containsLinks(text: string): boolean {
  return URL_REGEX.test(text) || EMAIL_REGEX.test(text)
}

export function extractLinks(text: string): string[] {
  const urls = text.match(URL_REGEX) || []
  const emails = text.match(EMAIL_REGEX) || []
  return [...urls, ...emails]
}

export function sanitizeText(text: string): string {
  return text.replace(URL_REGEX, '[LINK_REMOVED]').replace(EMAIL_REGEX, '[EMAIL_REMOVED]')
}