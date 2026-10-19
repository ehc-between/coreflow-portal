import { OrgMember, OrgRole } from '../../../core/org/org.models';
import {
  canEditMember,
  grantableRoles,
  isSelf,
  MULTIPLE_ROLES,
  roleSelectValue,
} from './member-rules';

const role = (key: string, grantable: boolean): OrgRole => ({
  key,
  name: key,
  permissions: [],
  grantable,
});
const member = (user_id: string, roles: string[]): OrgMember => ({
  user_id,
  email: `${user_id}@x.no`,
  full_name: user_id,
  is_active: true,
  roles,
});

const ROLES = [role('admin', false), role('auditor', true), role('member', true)];

describe('member rules', () => {
  it('filters to grantable roles only', () => {
    expect(grantableRoles(ROLES).map((r) => r.key)).toEqual(['auditor', 'member']);
  });

  it('detects the signed-in user', () => {
    expect(isSelf(member('u-1', []), 'u-1')).toBe(true);
    expect(isSelf(member('u-1', []), 'u-2')).toBe(false);
    expect(isSelf(member('u-1', []), null)).toBe(false);
  });

  it('never lets the user edit themselves', () => {
    expect(canEditMember(member('me', ['member']), ROLES, 'me')).toBe(false);
  });

  it('allows editing only members whose roles are all grantable', () => {
    expect(canEditMember(member('u-1', ['member']), ROLES, 'me')).toBe(true);
    expect(canEditMember(member('u-2', ['admin']), ROLES, 'me')).toBe(false);
    expect(canEditMember(member('u-3', ['member', 'admin']), ROLES, 'me')).toBe(false);
  });

  it('disallows editing before roles have loaded', () => {
    expect(canEditMember(member('u-1', ['member']), [], 'me')).toBe(false);
  });

  it('selects the single role, or the multiple-roles placeholder', () => {
    expect(roleSelectValue(member('u', ['auditor']))).toBe('auditor');
    expect(roleSelectValue(member('u', ['auditor', 'member']))).toBe(MULTIPLE_ROLES);
    expect(roleSelectValue(member('u', []))).toBe(MULTIPLE_ROLES);
  });
});
