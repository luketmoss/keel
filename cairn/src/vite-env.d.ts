/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  /** #93: dev-only, gates the fake Drive. `'1'` to enable; anything else
      (including unset) behaves exactly as today. Read only from
      `main.tsx`, alongside the `import.meta.env.DEV` check that keeps it
      out of production builds regardless of this variable's value. */
  readonly VITE_FAKE_DRIVE?: string
}
