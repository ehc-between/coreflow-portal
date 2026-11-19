import { HttpErrorResponse } from '@angular/common/http';
import { toneFor } from '../../shared/ui/tones';
import { ContextRecord, RaciMatrix } from './data/context.models';
import { factorFlowKey, factorTargets } from './data/factor-follow-ups';
import { communicateBody, decodeAssignee } from './detail/communicate-panel';
import { lifecycleBody, placeActions } from './detail/context-detail';
import { exclusionFramework, exclusionNumber } from './detail/record-body';
import {
  addMonths,
  addressedBadge,
  asKind,
  contextErrorKey,
  dayOf,
  dayToWire,
  needsFollowUp,
  significanceTone,
  intervalOptions,
  isPastDay,
  lifecycleActions,
  linesOf,
  orderFrameworks,
  partyPriority,
  priorityBadge,
  recordPath,
  statusBadge,
  withoutTitleHeading,
} from './context-kinds';
import { splitFactorTargets } from './data/factor-follow-ups';
import { draftRaciWarnings } from './form/raci-editor';
import { rowBadges } from './list/context-list';
import {
  cleanFilters,
  listFilters,
  moreFiltersActive,
  splitFilters,
  toListQuery,
} from './list/list-config';
import { visibleFrameworks } from './ui/framework-picker';
import { attentionItems, registerTiles, setupSteps } from './overview/context-overview';
import { columnCounts, warningCounts } from './raci/raci-matrix';
import { boardColumns } from './ui/analysis-board';
import { raciGroups } from './ui/raci-chips';

describe('context kinds', () => {
  it('maps route data to kinds and records to their detail paths', () => {
    expect(asKind('policy')).toBe('policy');
    expect(asKind('nope')).toBe('analysis');
    expect(recordPath('party', 'p1')).toBe('/context/interested-parties/p1');
  });

  it('offers the lifecycle steps of each status', () => {
    expect(lifecycleActions('draft')).toEqual(['submit', 'approve', 'retire']);
    expect(lifecycleActions('in_review')).toEqual(['approve', 'return', 'retire']);
    expect(lifecycleActions('approved')).toEqual(['review', 'retire']);
    expect(lifecycleActions('retired')).toEqual([]);
  });

  it('builds lifecycle bodies', () => {
    expect(lifecycleBody('approve', ' ')).toEqual({});
    expect(lifecycleBody('approve', 'OK')).toEqual({ comment: 'OK' });
    expect(lifecycleBody('return', ' Fix it ')).toEqual({ reason: 'Fix it' });
    expect(lifecycleBody('review', 'Still valid')).toEqual({ notes: 'Still valid' });
    expect(lifecycleBody('retire', '')).toEqual({});
  });

  it('places parties on the power / interest grid', () => {
    expect(partyPriority('high', 'high')).toBe('manage_closely');
    expect(partyPriority('high', 'low')).toBe('keep_satisfied');
    expect(partyPriority('medium', 'high')).toBe('keep_informed');
    expect(partyPriority('medium', 'medium')).toBe('monitor');
  });

  it('maps API errors to translated keys', () => {
    const coded = (status: number, code: string) =>
      new HttpErrorResponse({ status, error: { detail: { code, message: 'English' } } });
    expect(contextErrorKey(coded(422, 'change_reason_required'))).toBe(
      'context.errors.change_reason_required',
    );
    expect(contextErrorKey(coded(409, 'invalid_status'))).toBe('context.errors.invalid_status');
    expect(contextErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'context.errors.forbidden',
    );
    expect(contextErrorKey(new HttpErrorResponse({ status: 404, error: { detail: 'x' } }))).toBe(
      'context.errors.not_found',
    );
    expect(contextErrorKey(new Error('boom'))).toBe('errors.generic');
  });

  it('converts dates and lines', () => {
    expect(dayOf('2026-05-01T10:00:00')).toBe('2026-05-01');
    expect(dayOf(null)).toBe('');
    expect(dayToWire('2026-05-01')).toBe('2026-05-01T00:00:00');
    expect(dayToWire('')).toBeNull();
    expect(linesOf(' a \n\nb\na')).toEqual(['a', 'b']);
  });
});

describe('list config', () => {
  it('offers per-kind filters', () => {
    expect(listFilters('analysis').map((f) => f.key)).toEqual([
      'status',
      'method',
      'framework',
      'owner',
      'review_due',
    ]);
    expect(listFilters('party').map((f) => f.key)).toContain('addressed_status');
    expect(listFilters('party')[0].options.map((o) => o.value)).toEqual(['active', 'archived']);
  });

  it('keeps two filters in the toolbar and counts the rest', () => {
    const { visible, more } = splitFilters(listFilters('party'));
    expect(visible.map((f) => f.key)).toEqual(['status', 'addressed_status']);
    expect(more.map((f) => f.key)).toEqual([
      'category',
      'party_type',
      'framework',
      'owner',
      'review_due',
    ]);
    expect(moreFiltersActive(more, { owner: 'me', status: 'active', sort: 'title' })).toBe(2);
    expect(moreFiltersActive(more, { sort: '-updated_at' })).toBe(0);
    expect(listFilters('analysis', ['iso27001'])[2].options.map((o) => o.value)).toEqual([
      'iso27001',
    ]);
  });

  it('turns filter state into a list query', () => {
    const query = toListQuery(
      'policy',
      'iso',
      { status: 'approved', kind: 'ai', review_due: 'true' },
      25,
      25,
    );
    expect(query).toMatchObject({
      q: 'iso',
      status: ['approved'],
      review_due: true,
      sort: '-updated_at',
      offset: 25,
      extra: { kind: 'ai' },
    });
  });

  it('keeps only known filters', () => {
    expect(
      cleanFilters('scope', { status: 'draft', method: 'swot', q: 'x', sort: 'title' }),
    ).toEqual({
      status: 'draft',
      sort: 'title',
    });
  });
});

describe('view helpers', () => {
  it('builds overview tiles from the counts', () => {
    const tiles = registerTiles({
      analyses: { approved: 1, draft: 2, total: 3 },
      interested_parties: { active: 4, total: 5 },
      scope_statements: {},
      policies: { in_review: 1, total: 1 },
      responsibilities: { active: 2, total: 2 },
      frameworks_without_scope: [],
      policy_kinds_missing: [],
      reviews_overdue: 0,
      in_review: 1,
    });
    expect(tiles.map((t) => [t.kind, t.total, t.settled])).toEqual([
      ['analysis', 3, 1],
      ['party', 5, 4],
      ['scope', 0, 0],
      ['policy', 1, 0],
      ['responsibility', 2, 2],
    ]);
    expect(registerTiles(null).every((t) => t.total === 0)).toBe(true);
  });

  it('groups analysis items by the method’s categories', () => {
    const columns = boardColumns('swot', [
      { category: 'threat', text: 'Competition', impact: 'high' },
      { category: 'legal', text: 'Ignored', impact: 'low' },
    ]);
    expect(columns.map((c) => c.category)).toEqual([
      'strength',
      'weakness',
      'opportunity',
      'threat',
    ]);
    expect(columns[3].items).toHaveLength(1);
    expect(columns.flatMap((c) => c.items)).toHaveLength(1);
  });

  it('groups RACI assignments and flags gaps', () => {
    const assignments = [
      { type: 'role' as const, value: 'ciso', raci: 'A' as const, name: null },
      { type: 'user' as const, value: 'u1', raci: 'C' as const, name: 'Ada' },
    ];
    expect(raciGroups(assignments).map((g) => g.assignments.length)).toEqual([0, 1, 1, 0]);
    expect(draftRaciWarnings(assignments)).toEqual(['no_responsible']);
    expect(draftRaciWarnings([])).toEqual(['no_accountable', 'no_responsible']);
  });

  it('counts the letters per matrix column, preferring the API counts', () => {
    const matrix: RaciMatrix = {
      columns: [
        { type: 'role' as const, value: 'ciso', name: null },
        { type: 'user' as const, value: 'u1', name: 'Ada', counts: { R: 5, A: 0 } },
      ],
      rows: [
        {
          id: 'r1',
          code: 'RACI-1',
          title: 'A',
          area: null,
          cells: { 'role:ciso': 'A' as const, 'user:u1': 'R' as const },
          warnings: ['segregation_of_duties'],
        },
        {
          id: 'r2',
          code: 'RACI-2',
          title: 'B',
          area: null,
          cells: { 'role:ciso': 'A' as const },
          warnings: ['no_responsible'],
        },
      ],
    };
    const counts = columnCounts(matrix);
    expect(counts['role:ciso']).toEqual({ R: 0, A: 2, C: 0, I: 0 });
    expect(counts['user:u1']).toEqual({ R: 5, A: 0, C: 0, I: 0 });
    expect(warningCounts(matrix)).toEqual({ segregation_of_duties: 1, no_responsible: 1 });
    expect(warningCounts({ ...matrix, warning_counts: { no_accountable: 3 } })).toEqual({
      no_accountable: 3,
    });
  });

  it('builds the get-started steps and the needs-attention rows', () => {
    const overview = {
      analyses: { total: 1 },
      interested_parties: { total: 0 },
      scope_statements: { total: 2 },
      policies: {},
      responsibilities: {},
      frameworks_without_scope: [],
      policy_kinds_missing: [],
      reviews_overdue: 0,
      in_review: 2,
      parties_not_addressed: 3,
      responsibilities_segregation: 1,
    };
    const steps = setupSteps(overview);
    expect(steps.map((s) => [s.key, s.number, s.done])).toEqual([
      ['context_analysis', 1, true],
      ['interested_party', 2, false],
      ['scope_statement', 3, true],
      ['policy', 4, false],
      ['responsibility', 5, false],
    ]);
    // The backend's own steps win over the totals.
    const fromApi = setupSteps({
      ...overview,
      setup_steps: [{ key: 'policy', done: true, count: 4 }],
    });
    expect(fromApi[3]).toMatchObject({ done: true, count: 4 });
    expect(attentionItems(overview).map((a) => [a.key, a.count])).toEqual([
      ['partiesNotAddressed', 3],
      ['segregation', 1],
      ['inReview', 2],
    ]);
    expect(attentionItems(overview)[0].query).toEqual({ addressed_status: 'not_addressed' });
    expect(attentionItems(null)).toEqual([]);
  });

  it('shows only the non-zero parts of a tile', () => {
    const tiles = registerTiles({
      analyses: { approved: 1, draft: 0, in_review: 0, total: 1 },
      interested_parties: {},
      scope_statements: {},
      policies: {},
      responsibilities: {},
      frameworks_without_scope: [],
      policy_kinds_missing: [],
      reviews_overdue: 0,
      in_review: 0,
    });
    expect(tiles[0].parts).toEqual([{ key: 'context.overview.parts.approvedOne', count: 1 }]);
    expect(tiles[1].parts).toEqual([]);
  });

  it('colours badges by meaning: handling is never red, good news is never an alarm', () => {
    expect(
      toneFor(addressedBadge('not_addressed').meaning, addressedBadge('not_addressed').value),
    ).toBe('warn');
    expect(toneFor(addressedBadge('addressed').meaning, addressedBadge('addressed').value)).toBe(
      'pass',
    );
    // Significance uses one weight scale in every quadrant: never an alarm colour.
    expect(significanceTone('high')).toBe('accent');
    expect(significanceTone('low')).toBe('neutral');
    expect(['fail', 'pass']).not.toContain(significanceTone('medium'));
    expect(
      toneFor(priorityBadge('manage_closely').meaning, priorityBadge('manage_closely').value),
    ).not.toBe('fail');
    expect(statusBadge('in_review')).toEqual({
      meaning: 'lifecycle',
      value: 'in_review',
      labelKey: 'context.status.in_review',
    });
  });

  it('flags the factors that still need a follow-up like the API does', () => {
    const ref = { entity_type: 'risk', entity_id: 'r1' };
    expect(needsFollowUp('swot', { category: 'threat', impact: 'low' })).toBe(true);
    expect(needsFollowUp('swot', { category: 'threat', impact: 'high', follow_ups: [ref] })).toBe(
      false,
    );
    expect(needsFollowUp('swot', { category: 'strength', impact: 'high' })).toBe(false);
    expect(needsFollowUp('pestle', { category: 'legal', impact: 'high' })).toBe(true);
    expect(needsFollowUp('pestle', { category: 'legal', impact: 'medium' })).toBe(false);
  });

  it('offers one obvious follow-up per factor: a risk for bad news, an objective for good news', () => {
    expect(splitFactorTargets('threat', ['risk', 'task'])).toEqual({
      primary: 'risk',
      rest: ['task'],
    });
    expect(splitFactorTargets('opportunity', ['opportunity', 'objective', 'task']).primary).toBe(
      'objective',
    );
    expect(splitFactorTargets('strength', ['task'])).toEqual({ primary: 'task', rest: [] });
    expect(splitFactorTargets('legal', []).primary).toBeNull();
  });

  it('orders frameworks with the adopted ones first', () => {
    expect(orderFrameworks(['gdpr', 'iso27001']).slice(0, 3)).toEqual([
      'iso27001',
      'gdpr',
      'iso9001',
    ]);
    expect(visibleFrameworks(['iso9001'], ['nis2'], false)).toEqual(['iso9001', 'nis2']);
    expect(visibleFrameworks([], [], false)).toHaveLength(8);
    expect(visibleFrameworks(['iso9001'], [], true)[0]).toBe('iso9001');
  });

  it('computes review dates and interval options', () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toBe('2026-02-28');
    expect(addMonths(new Date(2026, 10, 17), 12)).toBe('2027-11-17');
    expect(addMonths(new Date(2026, 10, 17), 0)).toBe('');
    expect(intervalOptions('12')).toEqual([6, 12, 24, 36]);
    expect(intervalOptions('18')).toEqual([6, 12, 18, 24, 36]);
    expect(isPastDay('2020-01-01T00:00:00')).toBe(true);
    expect(isPastDay(null)).toBe(false);
  });

  it('drops a leading heading that only repeats the title', () => {
    expect(withoutTitleHeading('# Quality policy\n\nWe deliver.', 'Quality policy')).toBe(
      'We deliver.',
    );
    expect(withoutTitleHeading('## Scope\nText', 'Other title')).toBe('## Scope\nText');
    expect(withoutTitleHeading(null, 'X')).toBe('');
  });

  it('places header actions: one primary, Edit secondary, the rest in "Mer"', () => {
    expect(placeActions(['submit', 'approve', 'retire', 'edit'], false)).toEqual({
      primary: 'submit',
      secondary: ['edit'],
      overflow: ['approve', 'retire'],
    });
    expect(placeActions(['review', 'retire', 'communicate', 'edit'], false)).toEqual({
      primary: 'communicate',
      secondary: ['edit'],
      overflow: ['review', 'retire'],
    });
    expect(placeActions(['review', 'edit'], true).primary).toBe('review');
    expect(placeActions(['review', 'edit'], false)).toEqual({
      primary: 'edit',
      secondary: [],
      overflow: ['review'],
    });
    expect(placeActions([], false).primary).toBeNull();
  });

  it('offers the natural follow-ups per factor category', () => {
    expect(factorTargets('threat')).toEqual(['risk', 'task']);
    expect(factorTargets('opportunity')[0]).toBe('opportunity');
    expect(factorTargets('legal')).toEqual(['risk', 'opportunity', 'task']);
    expect(factorFlowKey('risk')).toBe('context_analysis.to_risk');
  });

  it('lists a row badge per kind', () => {
    const policy = {
      status: 'approved',
      acknowledgements: { total: 5, acknowledged: 3, pending: 2, overdue: 0, percent: 60 },
    } as unknown as ContextRecord;
    expect(rowBadges('policy', policy)[0].labelKey).toBe('context.list.badges.acknowledged');
    const silent = {
      status: 'approved',
      acknowledgements: { total: 0, acknowledged: 0, pending: 0, overdue: 0, percent: 0 },
    } as unknown as ContextRecord;
    expect(rowBadges('policy', silent)[0].labelKey).toBe('context.list.badges.notCommunicated');
    const raci = { warnings: ['no_accountable'] } as unknown as ContextRecord;
    expect(rowBadges('responsibility', raci)[0].labelKey).toBe(
      'context.raci.warnings.no_accountable',
    );
  });

  it('labels scope exclusions by standard and number', () => {
    expect(exclusionNumber({ clause: 'iso9001:8.3', justification: 'x' })).toBe('8.3');
    expect(exclusionNumber({ clause: 'iso9001:8.3', number: '8.3', justification: 'x' })).toBe(
      '8.3',
    );
    expect(exclusionFramework({ clause: 'iso27001-2022:A.5.1', justification: 'x' }, 'x')).toBe(
      'iso27001',
    );
    expect(exclusionFramework({ clause: '8.3', justification: 'x' }, 'iso9001')).toBe('iso9001');
  });

  it('decodes assignees and builds the communicate request', () => {
    expect(decodeAssignee('department:d1')).toEqual({ type: 'department', value: 'd1' });
    expect(decodeAssignee('')).toBeNull();
    expect(communicateBody('', '', '')).toBeNull();
    expect(communicateBody('role:member', '2026-06-01', ' Read it ')).toEqual({
      assignee: { type: 'role', value: 'member' },
      due_at: '2026-06-01T23:59:59',
      message: 'Read it',
    });
  });
});
