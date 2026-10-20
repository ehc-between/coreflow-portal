import { hasAnyPermission } from './permission';

describe('hasAnyPermission', () => {
  it('checks a single key', () => {
    expect(hasAnyPermission(['org:manage'], 'org:manage')).toBe(true);
    expect(hasAnyPermission(['users:invite'], 'org:manage')).toBe(false);
  });

  it('checks any-of a list', () => {
    expect(hasAnyPermission(['users:invite'], ['org:manage', 'users:invite'])).toBe(true);
    expect(hasAnyPermission(['dashboard:view'], ['org:manage', 'users:invite'])).toBe(false);
    expect(hasAnyPermission(['org:manage'], [])).toBe(false);
  });

  it('treats missing grants as none', () => {
    expect(hasAnyPermission(undefined, 'org:manage')).toBe(false);
    expect(hasAnyPermission(null, ['org:manage'])).toBe(false);
  });
});
