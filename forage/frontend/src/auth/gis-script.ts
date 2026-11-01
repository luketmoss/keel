// Google Identity Services, loaded by the live sign-in only. Kept out of
// index.html so demo mode makes no request to Google.

export const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Add the GIS script tag once. The session waits for its global itself. */
export function loadGisScript(): void {
  if (document.querySelector(`script[src="${GIS_SRC}"]`)) return;
  const script = document.createElement('script');
  script.src = GIS_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}
