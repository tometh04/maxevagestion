const ALLOWED_EMAILS = new Set<string>([
  "mypupybox@gmail.com",
])

export function isTawkUser(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.has(email.trim().toLowerCase())
}
