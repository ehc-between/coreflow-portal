import {
  bandFor,
  contrastText,
  fromDateInput,
  parseControlRefs,
  soaLink,
  templateLabel,
  toDateInput,
} from './data/risk-display';
import { riskErrorKey } from './data/risk-errors';
import { HttpErrorResponse } from '@angular/common/http';
import { bandKey, draftBody } from './matrices/matrix-editor';
import { emptyRiskForm, toRiskCreate, toRiskUpdate } from './risks/risk-form';
import { parseRiskFilters, riskQuery } from './risks/risk-list';
import { soaEntryPatch } from './soa/soa-view';
import { SoaEntry } from './data/risk.models';

const t = (key: string) => `T(${key})`;

const MATRIX = {
  bands: [
    { key: 'low', label: 'Low', min_score: 1, color: '#16a34a' },
    { key: 'medium', label: 'Medium', min_score: 5, color: '#eab308' },
    { key: 'high', label: 'High', min_score: 10, color: '#f97316' },
  ],
  cells: { '1:5': 'high' } as Record<string, string>,
};

describe('risk display helpers', () => {
  it('translates untouched template labels and keeps the org own labels', () => {
    expect(templateLabel('bands', 'low', 'Low', t)).toBe('T(risk.matrix.bands.low)');
    expect(templateLabel('bands', 'low', 'Lite', t)).toBe('Lite');
    expect(templateLabel('levels', 'custom', 'Custom', t)).toBe('Custom');
    expect(templateLabel('levels', null, null, t)).toBe('');
  });

  it('finds the band by score and honours cell overrides', () => {
    expect(bandFor(MATRIX, 1, 1)?.key).toBe('low');
    expect(bandFor(MATRIX, 2, 3)?.key).toBe('medium');
    expect(bandFor(MATRIX, 5, 5)?.key).toBe('high');
    expect(bandFor(MATRIX, 1, 5)?.key).toBe('high');
  });

  it('picks readable text on band colours', () => {
    expect(contrastText('#ffffff')).toBe('#111827');
    expect(contrastText('#1e3a8a')).toBe('#ffffff');
    expect(contrastText(null)).toBe('var(--fg)');
  });

  it('converts dates, control refs and SoA links', () => {
    expect(toDateInput('2026-11-12T00:00:00')).toBe('2026-11-12');
    expect(fromDateInput('2026-11-12')).toBe('2026-11-12T00:00:00');
    expect(fromDateInput('')).toBeNull();
    expect(parseControlRefs('a:1, b:2\nb:2 ;c:3')).toEqual(['a:1', 'b:2', 'c:3']);
    expect(soaLink('iso27001-2022:A.5.15')).toEqual({
      path: ['/risk/soa', 'iso27001-2022'],
      control: 'A.5.15',
    });
    expect(soaLink('bad')).toBeNull();
  });

  it('maps coded errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'matrix_in_use' } },
    });
    expect(riskErrorKey(coded)).toBe('risk.errors.matrix_in_use');
    expect(riskErrorKey(new HttpErrorResponse({ status: 403 }))).toBe('risk.errors.forbidden');
    expect(riskErrorKey(new Error('x'))).toBe('errors.generic');
  });
});

describe('risk form helpers', () => {
  it('builds a create body with nulls for blanks and parsed refs', () => {
    const body = toRiskCreate({
      ...emptyRiskForm('reg-1'),
      title: '  Stolen laptop ',
      control_refs: 'iso27001-2022:A.8.1, iso27001-2022:A.8.24',
      inherent: { likelihood: 3, consequence: 4 },
    });
    expect(body.title).toBe('Stolen laptop');
    expect(body.register_id).toBe('reg-1');
    expect(body.description).toBeNull();
    expect(body.inherent_likelihood).toBe(3);
    expect(body.control_refs).toEqual(['iso27001-2022:A.8.1', 'iso27001-2022:A.8.24']);
  });

  it('patches only what changed, sending ratings as pairs', () => {
    const original = {
      ...emptyRiskForm('reg-1'),
      title: 'A',
      inherent: { likelihood: 2, consequence: 2 },
    };
    const next = { ...original, inherent: { likelihood: 3, consequence: 2 } };
    expect(toRiskUpdate(original, next, ' rerated ')).toEqual({
      inherent_likelihood: 3,
      inherent_consequence: 2,
      change_reason: 'rerated',
    });
    expect(toRiskUpdate(original, original, 'nothing')).toEqual({});
  });
});

describe('risk list filters', () => {
  it('parses URL params with safe fallbacks', () => {
    expect(
      parseRiskFilters({ status: 'bogus', sort: 'title', owner: 'me', review: 'due' }),
    ).toEqual({
      status: 'open',
      register: '',
      level: '',
      owner: 'me',
      review: 'due',
      sort: 'title',
    });
  });

  it('turns filters into the API query', () => {
    const open = riskQuery(parseRiskFilters({}), 'fire', 0);
    expect(open.status).toEqual(['identified', 'assessed', 'in_treatment', 'monitoring']);
    expect(open.include_closed).toBe(false);
    expect(open.q).toBe('fire');
    const all = riskQuery(parseRiskFilters({ status: 'all', level: 'high' }), '', 50);
    expect(all.status).toEqual([]);
    expect(all.include_closed).toBe(true);
    expect(all.level).toEqual(['high']);
    expect(all.offset).toBe(50);
  });
});

describe('SoA entry patch', () => {
  const entry = {
    applicable: true,
    implementation_status: 'planned',
    justification: null,
    inclusion_reasons: ['risk_assessment'],
    implementation_notes: null,
    owner: null,
  } as unknown as SoaEntry;

  it('sends only changes plus review and reason', () => {
    expect(
      soaEntryPatch(entry, {
        applicable: false,
        implementation_status: 'planned',
        justification: ' Not relevant ',
        inclusion_reasons: ['risk_assessment'],
        implementation_notes: '',
        owner_user_id: '',
        reviewed: true,
        change_reason: '',
      }),
    ).toEqual({ applicable: false, justification: 'Not relevant', reviewed: true });
  });
});

describe('matrix editor helpers', () => {
  it('derives unique snake_case band keys', () => {
    expect(bandKey('Very High!', [])).toBe('very_high');
    expect(bandKey('Low', ['low'])).toBe('low_2');
    expect(bandKey('123', [])).toBe('band');
  });

  it('sorts bands, caps scores and drops cells outside the grid', () => {
    const body = draftBody({
      name: ' M ',
      description: '',
      likelihood_levels: [
        { value: 1, label: 'A' },
        { value: 2, label: 'B' },
      ],
      consequence_levels: [
        { value: 1, label: 'X' },
        { value: 2, label: 'Y' },
      ],
      bands: [
        { key: 'high', label: 'High', min_score: 9, color: '#f00000' },
        { key: 'low', label: 'Low', min_score: 1, color: '#00f000' },
      ],
      cells: { '2:2': 'low', '5:5': 'high' },
      acceptable_max_score: '2',
      is_default: false,
    });
    expect(body.name).toBe('M');
    expect(body.bands?.map((b) => [b.key, b.min_score])).toEqual([
      ['low', 1],
      ['high', 4],
    ]);
    expect(body.cells).toEqual({ '2:2': 'low' });
    expect(body.acceptable_max_score).toBe(2);
  });
});
