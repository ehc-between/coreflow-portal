import { roleDescription, roleLabel } from './roles';

const DICT: Record<string, string> = {
  'roles.admin.name': 'Administrator',
  'roles.admin.description': 'Full access.',
};
/** Mimics Transloco: a missing key translates to itself. */
const translate = (key: string): string => DICT[key] ?? key;

describe('roleLabel', () => {
  const roles = [
    { key: 'admin', name: 'Admin (stored)' },
    { key: 'role-fd6b9ef9', name: 'Site lead' },
  ];

  it('uses the translation for seeded roles', () => {
    expect(roleLabel(translate, 'admin', roles)).toBe('Administrator');
  });

  it('uses the stored name for custom org roles, never the i18n key', () => {
    expect(roleLabel(translate, 'role-fd6b9ef9', roles)).toBe('Site lead');
  });

  it('falls back to the role key when nothing else is known', () => {
    expect(roleLabel(translate, 'role-unknown')).toBe('role-unknown');
  });
});

describe('roleDescription', () => {
  it('is empty for roles without a translated description', () => {
    expect(roleDescription(translate, 'admin')).toBe('Full access.');
    expect(roleDescription(translate, 'role-fd6b9ef9')).toBe('');
  });
});
