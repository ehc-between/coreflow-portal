import { isPortalPath, withOrg } from './org-link';

describe('isPortalPath', () => {
  it('accepts internal paths', () => {
    expect(isPortalPath('/deviations/d-1')).toBe(true);
    expect(isPortalPath('/')).toBe(true);
    expect(isPortalPath('/risk/r-1?tab=a#b')).toBe(true);
  });

  it('rejects off-site, protocol-relative, backslash and non-string values', () => {
    for (const value of [
      '//evil.example/x',
      '/\\evil.example',
      '/a\\b',
      'https://evil.example',
      'javascript:alert(1)',
      'deviations/d-1',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(isPortalPath(value)).toBe(false);
    }
  });
});

describe('withOrg', () => {
  it('adds the org as a query parameter', () => {
    expect(withOrg('/deviations/d-1', 'o-1')).toBe('/deviations/d-1?org=o-1');
  });

  it('keeps existing parameters and the fragment', () => {
    expect(withOrg('/deviations/d-1?action=a-1#log', 'o-1')).toBe(
      '/deviations/d-1?action=a-1&org=o-1#log',
    );
  });

  it('replaces an org already on the path', () => {
    expect(withOrg('/deviations/d-1?org=other', 'o-1')).toBe('/deviations/d-1?org=o-1');
  });

  it('returns null for a path that would leave the portal', () => {
    expect(withOrg('//evil.example/x', 'o-1')).toBeNull();
    expect(withOrg('https://evil.example/x', 'o-1')).toBeNull();
  });
});
