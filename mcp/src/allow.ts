/**
 * Whether a signed-in GitHub account may use the Worker.
 *
 * Matches on the numeric user ID, which never changes, and not on the login,
 * which the account owner can rename and someone else can then claim. An unset
 * or malformed allow-list refuses everyone: failing open would make a missing
 * secret an open door.
 */
export function isAllowedGithubUser(id: unknown, allowed: string | undefined): boolean {
  if (typeof allowed !== 'string' || !/^\d+$/.test(allowed.trim())) return false
  if (typeof id !== 'number' && typeof id !== 'string') return false
  const candidate = String(id).trim()
  return /^\d+$/.test(candidate) && candidate === allowed.trim()
}
