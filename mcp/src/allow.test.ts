import { describe, expect, it } from 'vitest'
import { isAllowedGithubUser } from './allow'

describe('isAllowedGithubUser', () => {
  it('accepts the allowed numeric ID', () => {
    expect(isAllowedGithubUser(12345, '12345')).toBe(true)
    expect(isAllowedGithubUser('12345', ' 12345 ')).toBe(true)
  })

  it('refuses a different ID', () => {
    expect(isAllowedGithubUser(54321, '12345')).toBe(false)
  })

  it('decides on the ID alone, never the login', () => {
    // Same ID under a new login is the same person; a login can be renamed.
    const renamed = { id: 12345, login: 'new-name' }
    const impostor = { id: 99999, login: 'original-name' }
    expect(isAllowedGithubUser(renamed.id, '12345')).toBe(true)
    expect(isAllowedGithubUser(impostor.id, '12345')).toBe(false)
  })

  it('refuses everyone when the allow-list is missing or malformed', () => {
    expect(isAllowedGithubUser(12345, undefined)).toBe(false)
    expect(isAllowedGithubUser(12345, '')).toBe(false)
    expect(isAllowedGithubUser(12345, 'octocat')).toBe(false)
    expect(isAllowedGithubUser('', '')).toBe(false)
  })

  it('refuses a candidate that is not a plain ID', () => {
    expect(isAllowedGithubUser(undefined, '12345')).toBe(false)
    expect(isAllowedGithubUser('12345abc', '12345')).toBe(false)
    expect(isAllowedGithubUser(null, '12345')).toBe(false)
  })
})
