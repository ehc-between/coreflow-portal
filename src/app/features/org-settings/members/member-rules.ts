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

/** The role shown in a member's role select (a member normally holds exactly one). */
export function primaryRole(member: Pick<OrgMember, 'roles'>): string {
  return member.roles[0] ?? '';
}
