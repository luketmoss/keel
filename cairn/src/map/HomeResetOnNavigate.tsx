import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useHomeReset } from './useHomeReset'

/** #314 — the camera survives navigation everywhere except arrival at `/`.
    Route-driven rather than hung off each `navigate('/')` call site in
    `App.tsx`, so the browser's own Back/Forward lands home too, not just the
    in-app Back controls. Renders nothing; it exists only to run the effect
    below wherever it's mounted inside `MapProvider`. */
export function HomeResetOnNavigate() {
  const location = useLocation()
  const resetToHome = useHomeReset()
  /* Holds the previous pathname across renders so the very first render —
     whatever route it happens to be, including `/` itself on a fresh load —
     never counts as an arrival: the map already opens on the home view via
     `defaultBounds`, and firing this on mount would just be a second,
     redundant glide over the top of it. */
  const previousPathname = useRef(location.pathname)

  useEffect(() => {
    const arrivedHome = location.pathname === '/' && previousPathname.current !== '/'
    previousPathname.current = location.pathname
    if (arrivedHome) resetToHome()
  }, [location.pathname, resetToHome])

  return null
}
