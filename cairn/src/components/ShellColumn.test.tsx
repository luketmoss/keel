import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShellColumn } from './ShellColumn'
import { PHONE_QUERY } from '../map/useIsPhone'

/** jsdom has no layout and no `matchMedia`, so the breakpoint has to be
    stated rather than measured — which is also the point of `useIsPhone`
    existing: one answer to "which layout is on screen", not a media query
    in a stylesheet and a component guess that can drift apart. */
function stubMatchMedia(isPhone: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === PHONE_QUERY ? isPhone : false,
      media: query,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    }),
  })
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
  vi.restoreAllMocks()
})

function renderShell(props: Partial<React.ComponentProps<typeof ShellColumn>> = {}) {
  return render(
    <ShellColumn
      collapsed={props.collapsed ?? false}
      onToggleCollapsed={props.onToggleCollapsed ?? (() => {})}
      collapsible={props.collapsible ?? true}
      searchCard={props.searchCard ?? <div data-testid="card">card</div>}
      chips={props.chips ?? <div data-testid="chips">chips</div>}
    >
      {props.children ?? <div data-testid="face">list</div>}
    </ShellColumn>,
  )
}

describe('ShellColumn', () => {
  it('renders the column above the breakpoint', () => {
    stubMatchMedia(false)
    const { container } = renderShell()

    expect(container.querySelector('.shell-column')).not.toBeNull()
    expect(container.querySelector('.bottom-sheet')).toBeNull()
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toBeDefined()
  })

  it('renders the sheet below it, and no full-bleed column', () => {
    stubMatchMedia(true)
    const { container } = renderShell()

    expect(container.querySelector('.bottom-sheet')).not.toBeNull()
    expect(container.querySelector('.shell-column')).toBeNull()
    // The desktop collapse tab has no meaning against a sheet.
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resize sheet' })).toBeDefined()
  })

  it('carries the same card, chips and face into either container', () => {
    stubMatchMedia(true)
    const phone = renderShell()
    expect(screen.getByTestId('card')).toBeDefined()
    expect(screen.getByTestId('chips')).toBeDefined()
    expect(screen.getByTestId('face')).toBeDefined()
    phone.unmount()

    stubMatchMedia(false)
    renderShell()
    expect(screen.getByTestId('card')).toBeDefined()
    expect(screen.getByTestId('chips')).toBeDefined()
    expect(screen.getByTestId('face')).toBeDefined()
  })

  it('a detail suspends the sheet at full rather than offering a collapse', () => {
    stubMatchMedia(true)
    renderShell({ collapsible: false })

    expect(screen.getByRole('button', { name: 'Resize sheet' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })

  it('falls back to the column when matchMedia is unavailable', () => {
    delete (window as { matchMedia?: unknown }).matchMedia
    const { container } = renderShell()

    expect(container.querySelector('.shell-column')).not.toBeNull()
  })
})
