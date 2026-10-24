import { archivedBoards } from '../../state/board-store';
import { isDemoMode } from '../../demo/is-demo-mode';
import type { UserInfo } from '../../api/types';
import { ThemeToggle } from '../board/theme-toggle';
import { ChevronIcon, SignOutIcon } from './nav-icons';

interface SettingsScreenProps {
  user: UserInfo | null;
  onEditProfile: () => void;
  onOpenArchivedBoards: () => void;
  onOpenShortcuts: () => void;
  onSignOut: () => void;
}

/**
 * #623: what the user dropdown held, as a page of cards. Each row does what
 * its dropdown item did. Per-board settings stay in the board's menu.
 */
export function SettingsScreen({
  user,
  onEditProfile,
  onOpenArchivedBoards,
  onOpenShortcuts,
  onSignOut,
}: SettingsScreenProps) {
  const archivedCount = archivedBoards.value.length;

  return (
    <div class="settings-screen" data-testid="settings-screen">
      <div class="settings-page">
        {user && <p class="settings-subline">{user.email}</p>}
        <h1 class="page-title">Settings</h1>

        <section class="settings-card" aria-labelledby="settings-appearance">
          <h2 class="settings-card-title" id="settings-appearance">
            Appearance
          </h2>
          <div class="settings-field">
            <span class="settings-row-label">Theme</span>
            <ThemeToggle />
          </div>
        </section>

        {!isDemoMode() && (
          <section class="settings-card" aria-labelledby="settings-you">
            <h2 class="settings-card-title" id="settings-you">
              You
            </h2>
            <button type="button" class="settings-row" onClick={onEditProfile} data-testid="settings-edit-profile">
              <span class="settings-row-label">Edit profile</span>
              <span class="settings-row-chevron">
                <ChevronIcon />
              </span>
            </button>
          </section>
        )}

        <section class="settings-card" aria-labelledby="settings-boards">
          <h2 class="settings-card-title" id="settings-boards">
            Boards
          </h2>
          <button
            type="button"
            class="settings-row"
            onClick={onOpenArchivedBoards}
            data-testid="settings-archived-boards"
          >
            <span class="settings-row-label">Archived boards</span>
            <span class="settings-row-value">{archivedCount}</span>
            <span class="settings-row-chevron">
              <ChevronIcon />
            </span>
          </button>
        </section>

        <section class="settings-card settings-card-desktop-only" aria-labelledby="settings-help">
          <h2 class="settings-card-title" id="settings-help">
            Help
          </h2>
          <button type="button" class="settings-row" onClick={onOpenShortcuts} data-testid="settings-shortcuts">
            <span class="settings-row-label">Keyboard shortcuts</span>
            <span class="settings-row-chevron">
              <ChevronIcon />
            </span>
          </button>
        </section>

        <section class="settings-card">
          <button
            type="button"
            class="settings-row settings-row-danger"
            onClick={onSignOut}
            data-testid="settings-signout"
          >
            <span class="settings-row-icon">
              <SignOutIcon />
            </span>
            <span class="settings-row-label">Sign out</span>
          </button>
        </section>
      </div>
    </div>
  );
}
