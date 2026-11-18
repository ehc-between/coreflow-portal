import {
  clauseLabel,
  clauseSegment,
  editionKey,
  evidenceStateKey,
  exclusionHintKey,
  headlineScore,
  initials,
  isPastDate,
  isWeakQuality,
  legalFormOf,
  resolveClause,
  standardName,
} from './standards-display';

describe('standards display rules (A03)', () => {
  it('names the standard in the UI language, falling back to the catalogue name', () => {
    const gdpr = {
      name: 'General Data Protection Regulation',
      name_nb: 'Personvernforordningen (GDPR)',
    };
    expect(standardName(gdpr, 'nb')).toBe('Personvernforordningen (GDPR)');
    expect(standardName(gdpr, 'en')).toBe('General Data Protection Regulation');
    expect(standardName({ name: 'ISO 9001', name_nb: null }, 'nb')).toBe('ISO 9001');
  });

  it('reads NIS2 as a directive, and falls back to the old kind', () => {
    expect(legalFormOf({ legal_form: 'directive', kind: 'regulation' })).toBe('directive');
    expect(legalFormOf({ kind: 'regulation' })).toBe('regulation');
    expect(legalFormOf(null, 'regulation')).toBe('regulation');
    expect(legalFormOf({})).toBe('standard');
    expect(editionKey('standard')).toBe('standards.edition');
    expect(editionKey('directive')).toBe('standards.adopted');
  });

  it('shows one headline score: the API score, else readiness, else the covered share', () => {
    expect(headlineScore({ score: 42, completeness: { pct: 30 } }, 50)).toBe(42);
    expect(headlineScore({ score: null, completeness: { pct: 30 } }, 50)).toBe(50);
    expect(headlineScore({ completeness: { pct: 30 } })).toBe(30);
  });

  it('labels and routes clauses by their localised label and slug', () => {
    const node = {
      number: 'Chapter II',
      label: { en: 'Chapter II', nb: 'Kapittel II' },
      slug: 'chapter-ii',
    };
    expect(clauseLabel(node, 'nb')).toBe('Kapittel II');
    expect(clauseLabel({ number: '5.1' }, 'nb')).toBe('5.1');
    expect(clauseSegment(node)).toBe('chapter-ii');
    expect(clauseSegment({ number: '5.1' })).toBe('5.1');
  });

  it('resolves a route segment given as number, slug or encoded number', () => {
    const nodes = new Map([
      ['5.1', { number: '5.1', slug: '5-1' }],
      ['Chapter II', { number: 'Chapter II', slug: 'chapter-ii' }],
    ]);
    expect(resolveClause(nodes, '5.1')).toBe('5.1');
    expect(resolveClause(nodes, 'Chapter-II')).toBe('Chapter II');
    expect(resolveClause(nodes, 'Chapter%20II')).toBe('Chapter II');
    expect(resolveClause(nodes, 'nope')).toBeNull();
    expect(resolveClause(nodes, null)).toBeNull();
  });

  it('treats drafts, overdue reviews and obsolete documents as weak evidence', () => {
    expect(isWeakQuality('current')).toBe(false);
    expect(isWeakQuality('draft')).toBe(true);
    expect(isWeakQuality('review_overdue')).toBe(true);
    expect(isWeakQuality('obsolete')).toBe(true);
    expect(isWeakQuality(null)).toBe(false);
    expect(evidenceStateKey('fresh')).toBeNull();
    expect(evidenceStateKey('stale')).toBe('standards.evidenceState.stale');
    expect(evidenceStateKey('weak')).toBe('standards.evidenceState.weak');
  });

  it('explains the exclusion rule only where it restricts', () => {
    expect(exclusionHintKey('allowed')).toBeNull();
    expect(exclusionHintKey(undefined)).toBeNull();
    expect(exclusionHintKey('not_allowed')).toBe('standards.exclusion.notAllowed');
    expect(exclusionHintKey('conditional')).toBe('standards.exclusion.conditional');
  });

  it('flags past target dates and builds owner initials', () => {
    const today = new Date(2026, 10, 17);
    expect(isPastDate('2026-11-16', today)).toBe(true);
    expect(isPastDate('2026-11-17', today)).toBe(false);
    expect(isPastDate(null, today)).toBe(false);
    expect(initials('Kari Nordmann')).toBe('KN');
    expect(initials('Lars')).toBe('L');
    expect(initials('')).toBe('?');
  });
});
