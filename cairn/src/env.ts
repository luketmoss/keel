/**
 * The Maps browser key. Absent on a fresh clone and in CI, which is a state the
 * app has to render rather than crash on — an unset variable and one set to the
 * empty string in a committed `.env.example` are the same thing here.
 */
export const googleMapsApiKey: string | null =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || null

/**
 * The OAuth browser client ID used for Google sign-in. Same either-is-missing
 * rule as the Maps key: absent on a fresh clone and in CI, and the account row
 * simply doesn't render rather than the app crashing or showing a broken
 * control.
 */
export const googleClientId: string | null =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || null
