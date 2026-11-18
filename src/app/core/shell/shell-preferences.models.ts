/**
 * The signed-in user's shell preferences in one org (U03 shell v2):
 * `GET`/`PUT v1/me/orgs/{org_id}/preferences`, membership only (a non-member gets 404).
 */
export interface ShellPreferencesDto {
  /** Effective choice: the user's own if set, else the org default. Picks the shell. */
  readonly nav_v2: boolean;
  /** The org default (`organizations.nav_v2`, set in org settings). */
  readonly org_nav_v2: boolean;
  /** The user's own choice; null follows the org default. */
  readonly user_nav_v2: boolean | null;
  /** Pinned register keys (route paths); null applies the role defaults, `[]` means none. */
  readonly pins: readonly string[] | null;
}

/** `PUT` body: only the keys present change. */
export interface ShellPreferencesUpdate {
  /** `false` keeps the old menu, `true` forces the new one, `null` follows the org. */
  readonly nav_v2?: boolean | null;
  /** At most {@link MAX_PINS} keys matching {@link PIN_KEY_PATTERN}; `null` restores role defaults. */
  readonly pins?: readonly string[] | null;
}

/** The server rejects more pins than this (422). */
export const MAX_PINS = 5;

/** Pin keys the server accepts (1-120 characters). */
export const PIN_KEY_PATTERN = /^[A-Za-z0-9_.:/-]{1,120}$/;
