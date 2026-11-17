import { AI_ACT_ROLES, normaliseAiActRole } from './module.models';

describe('normaliseAiActRole', () => {
  it('keeps every role of the shared vocabulary', () => {
    for (const role of AI_ACT_ROLES) {
      expect(normaliseAiActRole(role)).toBe(role);
    }
  });

  it('maps the legacy profile values and anything unknown', () => {
    expect(normaliseAiActRole('both')).toBe('provider_and_deployer');
    expect(normaliseAiActRole('none')).toBe('not_applicable');
    expect(normaliseAiActRole('something')).toBe('unknown');
    expect(normaliseAiActRole(null)).toBe('unknown');
  });

  it('no longer offers the legacy values', () => {
    expect(AI_ACT_ROLES).not.toContain('both');
    expect(AI_ACT_ROLES).not.toContain('none');
  });
});
