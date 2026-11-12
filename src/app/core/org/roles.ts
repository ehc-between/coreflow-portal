/** Seeded role keys (global roles, assigned per org via memberships). */
export const ROLE_KEYS = [
  'admin',
  'quality_manager',
  'auditor',
  'dpo',
  'ciso',
  'hse_manager',
  'hr_manager',
  'ai_officer',
  'member',
] as const;

export type KnownRoleKey = (typeof ROLE_KEYS)[number];

/** i18n key for a role's display name; unknown keys fall back to the raw key upstream. */
export function roleNameKey(roleKey: string): string {
  return `roles.${roleKey}.name`;
}

/** i18n key for a role's one-line description. */
export function roleDescriptionKey(roleKey: string): string {
  return `roles.${roleKey}.description`;
}

/** A role as the label helpers need it: its key and stored (org-defined) name. */
export interface NamedRole {
  readonly key: string;
  readonly name: string;
}

/**
 * Display name of a role, never an i18n key: seeded roles use their translation
 * (`roles.<key>.name`); custom org roles — and seeded roles before the language
 * file has loaded — use the stored name from `roles`; anything else shows the
 * role key itself. Pass a signal-tracked `translate`
 * (`LanguageService.translate`) so the label refreshes on load / language switch.
 */
export function roleLabel(
  translate: (key: string) => string,
  roleKey: string,
  roles: readonly NamedRole[] = [],
): string {
  const key = roleNameKey(roleKey);
  const translated = translate(key);
  if (translated && translated !== key) {
    return translated;
  }
  return roles.find((role) => role.key === roleKey)?.name || roleKey;
}

/** One-line description of a role, or `''` when it has none (custom org roles). */
export function roleDescription(translate: (key: string) => string, roleKey: string): string {
  const key = roleDescriptionKey(roleKey);
  const translated = translate(key);
  return translated && translated !== key ? translated : '';
}
