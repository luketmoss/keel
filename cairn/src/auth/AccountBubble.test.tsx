import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AccountBubble } from './AccountBubble'
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

function renderBubble(account: GoogleAccount) {
  return render(
    <MemoryRouter>
      <AccountBubble account={account} />
    </MemoryRouter>,
  )
}

describe('AccountBubble', () => {
  it('renders nothing when unavailable', () => {
    const { container } = renderBubble(makeAccount({ status: 'unavailable' }))
    expect(container.innerHTML).toBe('')
  })

  it('shows a sign-in button when signed out', () => {
    renderBubble(makeAccount({ status: 'signed-out' }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined()
  })

  it('calls signIn when the sign-in button is clicked', () => {
    const signIn = vi.fn()
    renderBubble(makeAccount({ status: 'signed-out' }, { signIn }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled button while signing in', () => {
    renderBubble(makeAccount({ status: 'signing-in' }))
    expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveProperty('disabled', true)
  })

  it('shows the folder setup message', () => {
    renderBubble(makeAccount({ status: 'setting-up-folder' }))
    expect(screen.getByText('Setting up your Cairn folder…')).toBeDefined()
  })

  it('shows a Reconnecting status, with no button, while restoring a stored session', () => {
    renderBubble(makeAccount({ status: 'restoring' }))
    expect(screen.getByText('Reconnecting…')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a popup-blocked message distinct from a generic failure', () => {
    renderBubble(makeAccount({ status: 'signed-out', error: 'popup-blocked' }))
    expect(
      screen.getByText('Sign-in popup was blocked — allow popups for this site and try again'),
    ).toBeDefined()
  })

  it('shows a generic sign-in failure message', () => {
    renderBubble(makeAccount({ status: 'signed-out', error: 'sign-in-failed' }))
    expect(screen.getByText("Couldn't sign in — try again")).toBeDefined()
  })

  describe('signed in', () => {
    function signedInState(overrides: Partial<Extract<AccountState, { status: 'signed-in' }>> = {}) {
      return {
        status: 'signed-in' as const,
        email: 'jane@gmail.com',
        accessToken: 'tok',
        folderId: 'folder-1',
        name: 'Jane Doe',
        ...overrides,
      }
    }

    it('shows an avatar trigger with the account initial as a fallback (no picture)', () => {
      renderBubble(makeAccount(signedInState({ pictureUrl: undefined })))
      expect(screen.getByText('J')).toBeDefined()
    })

    it('renders the account picture when one is available', () => {
      renderBubble(makeAccount(signedInState({ pictureUrl: 'https://example.com/jane.jpg' })))
      const img = document.querySelector('img.account-bubble__avatar') as HTMLImageElement
      expect(img).not.toBeNull()
      expect(img.src).toBe('https://example.com/jane.jpg')
    })

    it('falls back to the initial when the picture fails to load', () => {
      renderBubble(makeAccount(signedInState({ pictureUrl: 'https://example.com/broken.jpg' })))
      const img = document.querySelector('img.account-bubble__avatar') as HTMLImageElement
      fireEvent.error(img)
      expect(screen.getByText('J')).toBeDefined()
    })

    it('opens the popover on click, showing the name, email and a sign-out action', () => {
      renderBubble(makeAccount(signedInState()))
      fireEvent.click(screen.getByRole('button', { name: /Account: Jane Doe/ }))

      expect(screen.getByText('Jane Doe')).toBeDefined()
      expect(screen.getByText('jane@gmail.com')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()
    })

    it('calls signOut and closes the popover when Sign out is clicked', () => {
      const signOut = vi.fn()
      renderBubble(makeAccount(signedInState(), { signOut }))
      fireEvent.click(screen.getByRole('button', { name: /Account:/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(signOut).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('closes on Escape and returns focus to the trigger', () => {
      renderBubble(makeAccount(signedInState()))
      const trigger = screen.getByRole('button', { name: /Account:/ })
      fireEvent.click(trigger)
      expect(screen.getByRole('menu')).toBeDefined()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })

    it('closes on a click outside', () => {
      renderBubble(makeAccount(signedInState()))
      fireEvent.click(screen.getByRole('button', { name: /Account:/ }))
      expect(screen.getByRole('menu')).toBeDefined()

      fireEvent.pointerDown(document.body)

      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('two rapid clicks toggle open then closed', () => {
      renderBubble(makeAccount(signedInState()))
      const trigger = screen.getByRole('button', { name: /Account:/ })
      fireEvent.click(trigger)
      expect(screen.getByRole('menu')).toBeDefined()

      fireEvent.click(trigger)
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('shows Retry on a folder setup failure, keeping the user signed in', () => {
    const retryFolderSetup = vi.fn()
    renderBubble(
      makeAccount({ status: 'folder-error', email: 'jane@gmail.com', accessToken: 'tok' }, { retryFolderSetup }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }))

    expect(screen.getByText("Couldn't set up the Cairn folder — try again")).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryFolderSetup).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()
  })

  it('shows Reconnect and the expiry message when the token has expired', () => {
    const reconnect = vi.fn()
    renderBubble(makeAccount({ status: 'token-expired', email: 'jane@gmail.com' }, { reconnect }))
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }))

    expect(
      screen.getByText('Your Drive session expired — reconnect to keep using Drive'),
    ).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(reconnect).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled, relabelled Reconnect button while a reconnect is in flight, keeping the expiry message', () => {
    renderBubble(makeAccount({ status: 'token-expired', email: 'jane@gmail.com', reconnecting: true }))
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }))

    expect(
      screen.getByText('Your Drive session expired — reconnect to keep using Drive'),
    ).toBeDefined()
    const button = screen.getByRole('button', { name: 'Reconnecting…' })
    expect(button).toHaveProperty('disabled', true)
  })
})
