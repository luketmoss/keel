# /brief local settings

Copy to `settings.local.md` in this folder. That name is gitignored: keep
real locations out of the repo, which is public.

Two decimal places (about 1 km) is plenty for a forecast.

An optional `name:` is what the page calls the place. Without one the page
says "Home" and "Trails".

- **home**: `<lat>, <lon>`. name: Home. Gravel, road, and every other outdoor session
- **trails**: `<lat>, <lon>`. name: <Park or trailhead>. `bike:mountain` rides and hikes

An optional `webhook:` line is the MacroDroid URL the brief calls once it is
published, so the phone can open it (#617). It is a **secret**: anyone with it
can set off the phone's macros, so it belongs only in `settings.local.md`.
Without it the brief still publishes, and the phone isn't told. Setting up the
phone: [docs/brief-phone.md](../../../docs/brief-phone.md).

- **webhook**: `https://trigger.macrodroid.com/<device-id>/brief`
