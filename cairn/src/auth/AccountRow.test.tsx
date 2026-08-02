import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountRow } from './AccountRow'
import type { AccountState, GoogleAccount } from './useGoogleAccount'

function makeAccount(state: AccountState, overrides: Partial<GoogleAccount> = {}): GoogleAccount {
  return {
    state,
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryFolderSetup: vi.fn(),
    reconnect: vi.fn(),
    ...overrides,
  }
}

describe('AccountRow', () => {
  it('renders nothing when unavailable', () => {
    const { container } = render(<AccountRow account={makeAccount({ status: 'unavailable' })} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows a sign-in button when signed out', () => {
    render(<AccountRow account={makeAccount({ status: 'signed-out' })} />)
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDefined()
  })

  it('calls signIn when the sign-in button is clicked', () => {
    const signIn = vi.fn()
    render(<AccountRow account={makeAccount({ status: 'signed-out' }, { signIn })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled button while signing in', () => {
    render(<AccountRow account={makeAccount({ status: 'signing-in' })} />)
    expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveProperty('disabled', true)
  })

  it('shows the folder setup message', () => {
    render(<AccountRow account={makeAccount({ status: 'setting-up-folder' })} />)
    expect(screen.getByText('Setting up your Cairn folder…')).toBeDefined()
  })

  it('shows the account email and a sign-out control when signed in', () => {
    render(
      <AccountRow
        account={makeAccount({
          status: 'signed-in',
          email: 'jane@gmail.com',
          accessToken: 'tok',
          folderId: 'folder-1',
        })}
      />,
    )
    expect(screen.getByText('jane@gmail.com')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()
  })

  it('calls signOut when signed in and Sign out is clicked', () => {
    const signOut = vi.fn()
    render(
      <AccountRow
        account={makeAccount(
          { status: 'signed-in', email: 'jane@gmail.com', accessToken: 'tok', folderId: 'f1' },
          { signOut },
        )}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('shows a popup-blocked message distinct from a generic failure', () => {
    render(
      <AccountRow account={makeAccount({ status: 'signed-out', error: 'popup-blocked' })} />,
    )
    expect(
      screen.getByText('Sign-in popup was blocked — allow popups for this site and try again'),
    ).toBeDefined()
  })

  it('shows a generic sign-in failure message', () => {
    render(
      <AccountRow account={makeAccount({ status: 'signed-out', error: 'sign-in-failed' })} />,
    )
    expect(screen.getByText("Couldn't sign in — try again")).toBeDefined()
  })

  it('shows Retry and a close control on a folder setup failure, keeping the user signed in', () => {
    const retryFolderSetup = vi.fn()
    render(
      <AccountRow
        account={makeAccount(
          { status: 'folder-error', email: 'jane@gmail.com', accessToken: 'tok' },
          { retryFolderSetup },
        )}
      />,
    )
    expect(screen.getByText('jane@gmail.com')).toBeDefined()
    expect(screen.getByText("Couldn't set up the Cairn folder — try again")).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryFolderSetup).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()
  })

  it('shows Reconnect and the expiry message when the token has expired', () => {
    const reconnect = vi.fn()
    render(
      <AccountRow
        account={makeAccount({ status: 'token-expired', email: 'jane@gmail.com' }, { reconnect })}
      />,
    )
    expect(
      screen.getByText('Your Drive session expired — reconnect to keep using Drive'),
    ).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(reconnect).toHaveBeenCalledTimes(1)
  })
})
