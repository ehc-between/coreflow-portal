import {
  bandFor,
  contrastText,
  appetiteState,
  canonicalControlRef,
  controlsOf,
  currentRating,
  frameworksForCategory,
  fromDateInput,
  implementationValue,
  riskStatusValue,
  soaLink,
  standardDisplayName,
  subjectTypesFor,
  templateLabel,
  toDateInput,
} from './data/risk-display';
import { riskErrorKey } from './data/risk-errors';
import { HttpErrorResponse } from '@angular/common/http';
import { bandKey, draftBody } from './matrices/matrix-editor';
import { applyRiskPrefill, emptyRiskForm, toRiskCreate, toRiskUpdate } from './risks/risk-form';
import { moreFiltersCount, parseRiskFilters, riskQuery } from './risks/risk-list';
import { bulkHasChange, soaBulkBody, soaEntryPatch } from './soa/soa-view';
import { opportunityBand } from './shared/opportunity-score';
import {
  OpportunityFormValue,
  toOpportunityBody,
  toOpportunityUpdate,
} from './opportunities/opportunity-form';
import { Opportunity, Risk, SoaEntry } from './data/risk.models';

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
      control_refs: ['iso27001-2022:A.8.1', 'iso27001:A.8.24', 'iso27001:A.8.24'],
      inherent: { likelihood: 3, consequence: 4 },
    });
    expect(body.title).toBe('Stolen laptop');
    expect(body.register_id).toBe('reg-1');
    expect(body.description).toBeNull();
    expect(body.inherent_likelihood).toBe(3);
    // Canonical framework-key refs, without duplicates.
    expect(body.control_refs).toEqual(['iso27001:A.8.1', 'iso27001:A.8.24']);
    expect(body.source_entity_type).toBeNull();
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
      appetite: '',
      sort: 'title',
    });
  });

  it('turns filters into the API query', () => {
    const open = riskQuery(parseRiskFilters({}), 'fire', 0);
    // The same "open" as the overview KPI: accepted risks are still carried.
    expect(open.status).toEqual([
      'identified',
      'assessed',
      'in_treatment',
      'monitoring',
      'accepted',
    ]);
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

describe('A06 connected-risk helpers', () => {
  const rating = (score: number) => ({
    likelihood: 2,
    consequence: score / 2,
    score,
    level: 'high',
    label: 'High',
    color: '#f97316',
  });
  const risk = (over: Partial<Risk> = {}) =>
    ({
      inherent: rating(12),
      residual: null,
      above_appetite: false,
      acceptance: null,
      status: 'assessed',
      control_refs: [],
      ...over,
    }) as unknown as Risk;

  it('normalises control refs to the framework key', () => {
    expect(canonicalControlRef('iso27001-2022:A.8.13')).toBe('iso27001:A.8.13');
    expect(canonicalControlRef('iso27001:A.8.13')).toBe('iso27001:A.8.13');
    expect(canonicalControlRef('A.8.13')).toBe('A.8.13');
  });

  it('builds readable control rows from refs when the API sends no labels', () => {
    const [row] = controlsOf({ control_refs: ['iso27001-2022:A.8.13'] });
    expect(row.ref).toBe('iso27001:A.8.13');
    expect(row.number).toBe('A.8.13');
    expect(row.url).toBe('/risk/soa/iso27001-2022?control=A.8.13');
  });

  it('judges the current rating and the appetite like the backend', () => {
    expect(currentRating(risk())?.score).toBe(12);
    expect(currentRating(risk({ residual: rating(4) }))?.score).toBe(4);
    expect(appetiteState(risk())).toBeNull();
    expect(appetiteState(risk({ above_appetite: true }))).toBe('above');
    expect(appetiteState(risk({ above_appetite: true, status: 'accepted' }))).toBe('accepted');
    expect(appetiteState(risk({ accepted_above_appetite: true }))).toBe('accepted');
  });

  it('maps module values onto the shared tone vocabulary', () => {
    expect(riskStatusValue('in_treatment')).toBe('in_progress');
    expect(riskStatusValue('accepted')).toBe('archived');
    expect(implementationValue('not_started')).toBe('not_assessed');
    expect(implementationValue('implemented')).toBe('implemented');
  });

  it('narrows standards by register category and records by exposed type', () => {
    expect(frameworksForCategory('information_security')).toEqual(['iso27001', 'nis2']);
    expect(frameworksForCategory('enterprise')).toEqual([]);
    expect(subjectTypesFor('supplier')).toContain('supplier');
    expect(subjectTypesFor('location')).toEqual([]);
    expect(subjectTypesFor('')).toEqual([]);
  });

  it('names a standard without showing its internal key', () => {
    const tr = (k: string) => (k === 'risk.soa.standards.iso27001' ? 'ISO/IEC 27001:2022' : k);
    expect(standardDisplayName({ nb: 'ISO 27001 nb' }, 'iso27001-2022', 'x', 'nb', tr)).toBe(
      'ISO 27001 nb',
    );
    expect(standardDisplayName(undefined, 'iso27001-2022', 'Catalogue', 'nb', tr)).toBe(
      'ISO/IEC 27001:2022',
    );
    expect(standardDisplayName(undefined, 'iso9999-2020', 'Catalogue', 'nb', tr)).toBe('Catalogue');
  });

  it('sends the exposed record with the risk and prefills from a create flow', () => {
    const subject = { entity_type: 'supplier', entity_id: 's-1', title: 'Nimbus' };
    const body = toRiskCreate({ ...emptyRiskForm('reg-1', 'u-1'), title: 'X', subject });
    expect(body.source_entity_type).toBe('supplier');
    expect(body.source_entity_id).toBe('s-1');
    expect(body.owner_user_id).toBe('u-1');
    const prefilled = applyRiskPrefill(
      emptyRiskForm(),
      { title: 'Late delivery', source_type: 'supplier', source_ref: 'SUP-0002' },
      subject,
    );
    expect(prefilled.title).toBe('Late delivery');
    expect(prefilled.source_type).toBe('supplier');
    expect(prefilled.subject?.entity_id).toBe('s-1');
  });

  it('sends the exposed record as a pair in an edit', () => {
    const original = { ...emptyRiskForm('reg-1'), title: 'A' };
    const next = {
      ...original,
      subject: { entity_type: 'asset', entity_id: 'a-1', title: 'Laptop' },
    };
    expect(toRiskUpdate(original, next, '')).toEqual({
      source_entity_type: 'asset',
      source_entity_id: 'a-1',
    });
  });

  it('counts the "Flere filtre" options in use', () => {
    expect(moreFiltersCount(parseRiskFilters({}))).toBe(0);
    expect(moreFiltersCount(parseRiskFilters({ owner: 'me', appetite: 'above' }))).toBe(2);
    expect(riskQuery(parseRiskFilters({ appetite: 'above' }), '', 0).above_appetite).toBe(true);
  });

  it('builds the SoA bulk body from the chosen fields only', () => {
    const empty = {
      applicable: '' as const,
      implementation_status: '' as const,
      inclusion_reasons: [],
      justification: '',
      reviewed: false,
      change_reason: '',
    };
    expect(bulkHasChange(empty)).toBe(false);
    expect(bulkHasChange({ ...empty, change_reason: 'x' })).toBe(false);
    expect(
      soaBulkBody(['e1', 'e2'], {
        ...empty,
        applicable: 'no',
        justification: ' Not used ',
        implementation_status: 'planned',
      }),
    ).toEqual({
      entry_ids: ['e1', 'e2'],
      applicable: false,
      implementation_status: 'planned',
      justification: 'Not used',
    });
  });

  it('bands opportunity scores and sends their exposed record', () => {
    expect(opportunityBand(20)).toBe('high');
    expect(opportunityBand(9)).toBe('medium');
    expect(opportunityBand(4)).toBe('low');
    const body = toOpportunityBody({
      register_id: '',
      title: ' Idea ',
      description: '',
      source_type: 'process',
      source_ref: '',
      subject: { entity_type: 'process', entity_id: 'p-1', title: 'Billing' },
      benefit: '4',
      feasibility: '5',
      action_plan: '',
      owner_user_id: 'u-1',
      department_id: '',
      due_at: '',
    });
    expect(body.title).toBe('Idea');
    expect(body.source_entity_type).toBe('process');
    expect(body.benefit).toBe(4);
  });

  it('keeps an exposed record the editor cannot see when editing an opportunity', () => {
    const value: OpportunityFormValue = {
      register_id: '',
      title: 'Idea',
      description: '',
      source_type: 'supplier',
      source_ref: 'Acme',
      subject: null,
      benefit: '',
      feasibility: '',
      action_plan: '',
      owner_user_id: 'u-1',
      department_id: '',
      due_at: '',
    };
    // Hidden (unreadable) record: the API returns source_entity null; nothing changed.
    const hidden = { source_entity: null } as unknown as Opportunity;
    const unchanged = toOpportunityUpdate(hidden, value);
    expect('source_entity_type' in unchanged).toBe(false);
    expect('source_entity_id' in unchanged).toBe(false);
    expect(unchanged.title).toBe('Idea');
    // A visible record the user removes is cleared as a pair.
    const visible = {
      source_entity: { entity_type: 'supplier', entity_id: 's-1', title: 'Acme' },
    } as unknown as Opportunity;
    const cleared = toOpportunityUpdate(visible, value);
    expect(cleared.source_entity_type).toBeNull();
    expect(cleared.source_entity_id).toBeNull();
    // A new record is sent as a pair.
    const picked = toOpportunityUpdate(hidden, {
      ...value,
      subject: { entity_type: 'supplier', entity_id: 's-2', title: 'Beta' },
    });
    expect(picked.source_entity_type).toBe('supplier');
    expect(picked.source_entity_id).toBe('s-2');
  });
});
