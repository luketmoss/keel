import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { TripList } from './components/TripList'
import { TripDetail } from './components/TripDetail'
import { WorldMap } from './components/WorldMap'
import { DriveTripStore } from './store/driveTripStore'
import type { TripIndexEntry } from './store/tripStore'
import { useGoogleAccount, type GoogleAccount } from './auth/useGoogleAccount'
import { AccountBubble } from './auth/AccountBubble'
import { defaultOverridesStore } from './import/useTripImport'
import './App.css'

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  const account = useGoogleAccount()
  /* The one module allowed to import DriveTripStore directly — everything
     else depends on the TripStore interface. */
  const tripStore = useMemo(() => new DriveTripStore(), [])
  const trips = useSyncExternalStore(tripStore.subscribe, tripStore.getTrips)
  const createTrip = useCallback((name: string) => tripStore.createTrip(name), [tripStore])
  const deleteTrip = useCallback((id: string) => tripStore.deleteTrip(id), [tripStore])

  const accessToken = account.state.status === 'signed-in' ? account.state.accessToken : null
  const cairnFolderId = account.state.status === 'signed-in' ? account.state.folderId : null
  // #73: "disconnected" covers every state that leaves `accessToken` null —
  // never signed in this session, signed out, or #72's token-expired — and
  // all three get the same read-only treatment (design note: "One state,
  // one rule, stated once"). Superseded #72's narrower `driveExpired`,
  // which only covered the last of the three and left the other two
  // silently mutating a store with no way to reach Drive.
  const disconnected = accessToken === null

  // Hydrates every trip's index/overview from Drive and migrates any
  // local-only trip up, per #59's design note. Re-runs whenever the token
  // changes (a fresh sign-in, or a reconnect after expiry) — each run is
  // idempotent, so there's no harm re-hydrating on a token refresh that
  // didn't actually need it.
  useEffect(() => {
    if (!accessToken || !cairnFolderId) return
    void tripStore.connect(accessToken, cairnFolderId)
  }, [tripStore, accessToken, cairnFolderId])

  // #73: the mirror image of the effect above — every store holding Drive
  // credentials drops them the moment the account has no usable token, so a
  // mutation attempted afterward can't reach Drive and the read-only rule
  // has something to check. Runs on mount too (a no-op — neither store has
  // connected yet), and again on every transition into a disconnected
  // state, never on transitions between two disconnected states.
  useEffect(() => {
    if (!disconnected) return
    tripStore.disconnect?.()
    defaultOverridesStore.disconnect?.()
  }, [tripStore, disconnected])

  return (
    <Routes>
      {/* The trip detail page owns its own full shell (panel + map) —
          see TripDetail — rather than slotting into the default shell
          below, since its header and import panel differ from the
          default shell's. Matched first and exclusively: it is never
          mounted alongside the default shell, which is what lets its
          drag-and-drop target this trip without fighting a window-wide
          handler for the same drop. */}
      <Route
        path="/trips/:id"
        element={
          <TripDetail
            tripStore={tripStore}
            accessToken={accessToken}
            cairnFolderId={cairnFolderId}
            accountBubble={<AccountBubble account={account} />}
            onReconnect={() => void account.reconnect()}
          />
        }
      />
      <Route
        path="*"
        element={
          <DefaultShell
            account={account}
            trips={trips}
            createTrip={createTrip}
            deleteTrip={deleteTrip}
            disconnected={disconnected}
          />
        }
      />
    </Routes>
  )
}

interface DefaultShellProps {
  account: GoogleAccount
  trips: TripIndexEntry[]
  createTrip: (name: string) => void
  deleteTrip: (id: string) => void
  /** #73: no usable token — creating or deleting a trip goes to the
      language's Disabled treatment rather than staying live against a
      store that will refuse the write. */
  disconnected: boolean
}

/** The world map (`/`) and the trips list (`/trips`) — full-bleed, with the
    nav and account chrome floating above as their own L2 panels (#78).
    Nothing here reserves layout width or height from the main pane the way
    the old sidebar did. */
function DefaultShell({ account, trips, createTrip, deleteTrip, disconnected }: DefaultShellProps) {
  return (
    <div className="shell">
      <TopBar />
      <AccountBubble account={account} />
      <div className="shell__main">
        <Routes>
          <Route path="/" element={<WorldMap trips={trips} />} />
          <Route
            path="/trips"
            element={
              <TripList
                trips={trips}
                onCreate={createTrip}
                onDelete={deleteTrip}
                disabled={disconnected}
              />
            }
          />
          {/* v1's ephemeral scratch map, retired by #78 now that World is
              the homepage. Both old addresses land on the new one. */}
          <Route path="/map" element={<Navigate to="/" replace />} />
          <Route path="/world" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
