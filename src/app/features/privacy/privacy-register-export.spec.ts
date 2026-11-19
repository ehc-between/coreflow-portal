import { describe, expect, it } from 'vitest';
import { REGISTER_KEYS } from './data/privacy-registers';
import { REPORT_REGISTER, exportFilters } from './privacy-register-export';

describe('privacy register export (U12)', () => {
  it('maps every privacy register to its backend register export', () => {
    expect(REGISTER_KEYS.map((k) => REPORT_REGISTER[k]).every(Boolean)).toBe(true);
    expect(new Set(Object.values(REPORT_REGISTER)).size).toBe(REGISTER_KEYS.length);
  });

  it('passes the search text, and the statuses only where the register accepts them', () => {
    expect(exportFilters('ropa', ' lønn ', ['draft', 'active'])).toEqual({ q: 'lønn' });
    expect(exportFilters('processor', '', ['onboarding', 'active'])).toEqual({
      status: ['onboarding', 'active'],
    });
    expect(exportFilters('consent', '', [])).toEqual({});
  });
});
