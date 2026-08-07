import { useEffect, useState } from 'react'

/** The one place the phone breakpoint is a number.
 *
 * Matches the `max-width: 719px` the stylesheets already use, so the sheet
 * and the CSS that dresses it can never disagree about which layout is on
 * screen. Tablet takes the desktop column, deliberately: a column is the
 * better shape whenever there is room for one. */
export const PHONE_QUERY = '(max-width: 719px)'

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? false
      : window.matchMedia(PHONE_QUERY).matches,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(PHONE_QUERY)
    function handleChange(event: MediaQueryListEvent) {
      setIsPhone(event.matches)
    }
    setIsPhone(query.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return isPhone
}
