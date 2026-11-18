import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import { relevantRoles } from '../../core/org/roles';
import { OrgMember, OrgRole } from '../../core/org/org.models';
import { actionVerb, changedFields, snapshotValue } from './audit-log/audit-log-page';
import { countKey, departmentsWithoutLead } from './departments/departments-page';
import {
  EMPTY_MEMBER_FILTER,
  filterMembers,
  operatorCount,
  roleChange,
} from './members/member-rules';
import { cellActions, matrixCsv, matrixFromRoles } from './roles/roles-page';
import { SETTINGS_GROUPS, hubSections } from './settings-links/settings-links';
import { peopleLandingFor, peopleNavFor } from './settings-nav/settings-nav';

const role = (key: string, permissions: string[], grantable = true): OrgRole => ({
  key,
  name: key,
  permissions,
  grantable,
});

describe('member filters and role changes', () => {
  const members: OrgMember[] = [
    { user_id: 'a', email: 'a@x', full_name: 'Ada', is_active: true, roles: ['member'] },
    {
      user_id: 'o',
      email: 'super@x',
      full_name: 'Super',
      is_active: true,
      roles: ['admin'],
      is_platform_operator: true,
    },
  ];

  it('hides platform operators unless asked for', () => {
    expect(filterMembers(members, EMPTY_MEMBER_FILTER).map((m) => m.user_id)).toEqual(['a']);
    expect(filterMembers(members, { ...EMPTY_MEMBER_FILTER, showOperators: true })).toHaveLength(2);
    expect(operatorCount(members)).toBe(1);
  });

  it('describes the access a role change gains and loses', () => {
    const roles = [
      role('member', ['documents:read']),
      role('auditor', ['audit:read', 'risk:read']),
    ];
    const change = roleChange(['member'], ['auditor'], roles);
    expect(change.addedRoles).toEqual(['auditor']);
    expect(change.removedRoles).toEqual(['member']);
    expect(change.gainedModules).toEqual(['audit', 'risk']);
    expect(change.lostModules).toEqual(['documents']);
    expect(roleChange(['member'], ['member'], roles).changed).toBe(false);
  });

  it('offers seeded roles first, then custom roles somebody holds', () => {
    const roles = [role('role-x', []), role('member', []), role('admin', []), role('custom', [])];
    expect(relevantRoles(roles, ['custom']).map((r) => r.key)).toEqual([
      'admin',
      'member',
      'custom',
    ]);
  });
});

describe('role matrix', () => {
  const roles = [
    role('admin', ['org:manage', 'risk:read', 'risk:write']),
    role('member', ['risk:read']),
  ];

  it('builds a matrix from the role catalogue with the platform first', () => {
    const matrix = matrixFromRoles(roles);
    expect(matrix.modules.map((m) => m.key)).toEqual(['platform', 'risk']);
    const risk = matrix.modules[1];
    expect(cellActions(roles[1], risk)).toEqual(['read']);
    expect(cellActions(roles[0], risk)).toEqual(['read', 'write']);
  });

  it('exports one row per permission', () => {
    const matrix = matrixFromRoles(roles);
    const csv = matrixCsv(matrix.roles, matrix.modules, {
      role: (k) => k,
      module: (m) => m.key,
      header: 'Module',
    });
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('"risk · write";"x";""');
  });
});

describe('audit log helpers', () => {
  it('reads the verb and the changed fields', () => {
    expect(actionVerb('risk.status_changed')).toBe('status_changed');
    expect(changedFields({ before: { a: 1, b: 2 }, after: { a: 1, b: 3, c: 4 } })).toEqual([
      'b',
      'c',
    ]);
    expect(snapshotValue(null)).toBe('—');
    expect(snapshotValue(['x'])).toBe('["x"]');
  });
});

describe('departments', () => {
  it('flags departments without a lead and uses the singular for one', () => {
    expect(
      departmentsWithoutLead([
        { id: 'a', name: 'A', member_count: 1, lead_user_id: null },
        { id: 'b', name: 'B', member_count: 1, lead_user_id: 'u' },
        { id: 'c', name: 'C', member_count: 1 },
      ]).map((d) => d.id),
    ).toEqual(['a']);
    expect(countKey('x.memberCount', 1)).toBe('x.memberCountOne');
    expect(countKey('x.memberCount', 2)).toBe('x.memberCount');
  });
});

describe('settings navigation', () => {
  it('shows only the people tabs the caller may open', () => {
    expect(peopleNavFor(['users:invite']).map((i) => i.link)).toEqual([
      '/settings/invitations',
      '/settings/roles',
    ]);
    expect(peopleLandingFor(['org:manage'])).toBe('/settings/members');
    expect(peopleNavFor(['audit:read']).map((i) => i.link)).toEqual(['/settings/roles']);
  });

  it('groups the hub cards in the fixed section order', () => {
    const sections = hubSections(['org:manage', 'users:invite', 'records:admin', 'audit:read']);
    expect(sections.map((s) => s.group)).toEqual([...SETTINGS_GROUPS]);
    expect(hubSections(['audit:read']).map((s) => s.group)).toEqual(['people', 'trace']);
  });
});

describe('A26 i18n', () => {
  type Tree = Record<string, unknown>;
  const keys = (o: Tree, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v as Tree, `${p}${k}.`) : [`${p}${k}`],
    );

  it('has full en/nb parity for settings, account and admin', () => {
    for (const area of ['settings', 'account', 'admin', 'terms']) {
      expect(keys((nb as Tree)[area] as Tree).sort()).toEqual(
        keys((en as Tree)[area] as Tree).sort(),
      );
    }
  });

  it('translates every backend term key', () => {
    const termKeys = [
      'deviation',
      'document',
      'risk',
      'audit',
      'finding',
      'process',
      'task',
      'objective',
      'incident',
      'supplier',
      'employee',
      'ai_system',
      'asset',
      'candidate',
      'change_request',
      'complaint',
      'contract',
      'course',
      'customer_feedback',
      'inspection',
      'project',
      'survey',
    ];
    for (const lang of [en, nb] as Tree[]) {
      const terms = lang['terms'] as Record<string, { one?: string; other?: string }>;
      for (const key of termKeys) {
        expect(terms[key]?.one, key).toBeTruthy();
        expect(terms[key]?.other, key).toBeTruthy();
      }
    }
  });

  it('names the platform module the role matrix lists first', () => {
    for (const lang of [en, nb] as Tree[]) {
      expect(((lang['modules'] as Tree)['names'] as Tree)['platform']).toBeTruthy();
    }
  });
});
