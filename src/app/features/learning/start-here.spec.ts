import { START_HERE_CANDIDATES, START_HERE_SIZE, startHere } from './start-here';

describe('startHere', () => {
  it('keeps five lessons, in order, for the modules the org uses', () => {
    const all = startHere(() => true);
    expect(all).toHaveLength(START_HERE_SIZE);
    expect(all.map((c) => `${c.scope}.${c.key}`)).toEqual([
      'platform.getting-started',
      'platform.people-and-access',
      'deviations.good-deviation-report',
      'standards.readiness',
      'privacy.gdpr-principles',
    ]);
  });

  it('falls back to the next lessons when a module is off', () => {
    const picked = startHere((module) => module !== 'privacy' && module !== 'deviations');
    expect(picked.map((c) => c.key)).toEqual([
      'getting-started',
      'people-and-access',
      'readiness',
      'read-and-acknowledge',
      'working-with-tasks',
    ]);
    expect(picked.every((c) => c.module !== 'privacy')).toBe(true);
  });

  it('always has the basics, even with no modules', () => {
    const picked = startHere(() => false);
    expect(picked.map((c) => c.module)).toEqual([null, null, null, null]);
    expect(START_HERE_CANDIDATES.filter((c) => c.module === null)).toHaveLength(4);
  });
});
