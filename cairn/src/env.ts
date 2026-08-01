/**
 * The Maps browser key. Absent on a fresh clone and in CI, which is a state the
 * app has to render rather than crash on — an unset variable and one set to the
 * empty string in a committed `.env.example` are the same thing here.
 */
export const googleMapsApiKey: string | null =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || null
