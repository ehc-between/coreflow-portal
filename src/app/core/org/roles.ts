/** Seeded role keys (global roles, assigned per org via memberships). */
export const ROLE_KEYS = ['admin', 'quality_manager', 'auditor', 'dpo', 'ciso', 'member'] as const;

export type KnownRoleKey = (typeof ROLE_KEYS)[number];

/** i18n key for a role's display name; unknown keys fall back to the raw key upstream. */
export function roleNameKey(roleKey: string): string {
  return `roles.${roleKey}.name`;
}

/** i18n key for a role's one-line description. */
export function roleDescriptionKey(roleKey: string): string {
  return `roles.${roleKey}.description`;
}
