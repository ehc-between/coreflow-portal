import { OrgMember, OrgRole } from '../../../core/org/org.models';

/** Roles the caller may assign / invite with (the backend blocks escalation). */
export function grantableRoles(roles: readonly OrgRole[]): OrgRole[] {
  return roles.filter((role) => role.grantable);
}

/** Whether `member` is the signed-in user. */
export function isSelf(member: Pick<OrgMember, 'user_id'>, currentUserId: string | null): boolean {
  return currentUserId !== null && member.user_id === currentUserId;
}

/**
 * Whether the caller may change the role of / remove `member`: never themselves,
 * and only when every role the member holds is one the caller could grant (the
 * backend rejects modifying a member with permissions the caller lacks).
 */
export function canEditMember(
  member: OrgMember,
  roles: readonly OrgRole[],
  currentUserId: string | null,
): boolean {
  if (isSelf(member, currentUserId)) {
    return false;
  }
  const grantable = new Set(grantableRoles(roles).map((role) => role.key));
  if (grantable.size === 0) {
    return false;
  }
  return member.roles.every((key) => grantable.has(key));
}

/** Select value for a member holding several roles (a "Multiple roles" placeholder). */
export const MULTIPLE_ROLES = '';

/**
 * The value selected in a member's role select: their role when they hold
 * exactly one, otherwise the "Multiple roles" placeholder — so picking any single
 * role is a real change that collapses the member to that one role.
 */
export function roleSelectValue(member: Pick<OrgMember, 'roles'>): string {
  return member.roles.length === 1 ? member.roles[0] : MULTIPLE_ROLES;
}

// --- A26: search, filters and role changes ---------------------------------------------

/** Account status filter of the members list. */
export type MemberStatusFilter = 'all' | 'active' | 'inactive' | 'no_mfa';

export interface MemberFilter {
  readonly query: string;
  /** Role key, or null for every role. */
  readonly role: string | null;
  /** Department id, `none` for members without one, or null for every department. */
  readonly department: string | null;
  readonly status: MemberStatusFilter;
  /** Show platform operator (service) accounts too. Hidden by default. */
  readonly showOperators: boolean;
}

export const EMPTY_MEMBER_FILTER: MemberFilter = {
  query: '',
  role: null,
  department: null,
  status: 'all',
  showOperators: false,
};

/** Department filter value for "members without a department". */
export const NO_DEPARTMENT = 'none';

/** Whether any filter narrows the list (operators toggle excluded). */
export function isFiltered(filter: MemberFilter): boolean {
  return (
    filter.query.trim() !== '' ||
    filter.role !== null ||
    filter.department !== null ||
    filter.status !== 'all'
  );
}

/** Members matching `filter` (name, email or department name for the query). */
export function filterMembers(members: readonly OrgMember[], filter: MemberFilter): OrgMember[] {
  const q = filter.query.trim().toLowerCase();
  return members.filter((member) => {
    if (!filter.showOperators && member.is_platform_operator) return false;
    if (filter.role && !member.roles.includes(filter.role)) return false;
    const departments = member.departments ?? [];
    if (filter.department === NO_DEPARTMENT && departments.length > 0) return false;
    if (
      filter.department &&
      filter.department !== NO_DEPARTMENT &&
      !departments.some((d) => d.id === filter.department)
    ) {
      return false;
    }
    if (filter.status === 'active' && !member.is_active) return false;
    if (filter.status === 'inactive' && member.is_active) return false;
    if (filter.status === 'no_mfa' && member.mfa_enabled !== false) return false;
    if (!q) return true;
    return (
      (member.full_name ?? '').toLowerCase().includes(q) ||
      member.email.toLowerCase().includes(q) ||
      departments.some((d) => d.name.toLowerCase().includes(q))
    );
  });
}

/** How many platform operator accounts the list hides. */
export function operatorCount(members: readonly OrgMember[]): number {
  return members.filter((member) => member.is_platform_operator).length;
}

/** What a role change does: roles and module access gained or lost. */
export interface RoleChange {
  readonly addedRoles: readonly string[];
  readonly removedRoles: readonly string[];
  /** Module keys (permission prefixes) the member gains or loses any access to. */
  readonly gainedModules: readonly string[];
  readonly lostModules: readonly string[];
  /** Number of individual permissions gained / lost. */
  readonly gained: number;
  readonly lost: number;
  readonly changed: boolean;
}

function permissionsOf(keys: readonly string[], roles: readonly OrgRole[]): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    for (const permission of roles.find((role) => role.key === key)?.permissions ?? []) {
      out.add(permission);
    }
  }
  return out;
}

function modulesOf(permissions: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const permission of permissions) {
    out.add(permission.split(':')[0]);
  }
  return out;
}

/** Compare the member's current roles with `next` (the union of permissions applies). */
export function roleChange(
  current: readonly string[],
  next: readonly string[],
  roles: readonly OrgRole[],
): RoleChange {
  const before = permissionsOf(current, roles);
  const after = permissionsOf(next, roles);
  const beforeModules = modulesOf(before);
  const afterModules = modulesOf(after);
  const addedRoles = next.filter((key) => !current.includes(key));
  const removedRoles = current.filter((key) => !next.includes(key));
  return {
    addedRoles,
    removedRoles,
    gainedModules: [...afterModules].filter((m) => !beforeModules.has(m)).sort(),
    lostModules: [...beforeModules].filter((m) => !afterModules.has(m)).sort(),
    gained: [...after].filter((p) => !before.has(p)).length,
    lost: [...before].filter((p) => !after.has(p)).length,
    changed: addedRoles.length > 0 || removedRoles.length > 0,
  };
}
