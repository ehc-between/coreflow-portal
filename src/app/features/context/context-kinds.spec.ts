import { HttpErrorResponse } from '@angular/common/http';
import { communicateBody, decodeAssignee } from './detail/communicate-panel';
import { lifecycleBody } from './detail/context-detail';
import {
  asKind,
  contextErrorKey,
  dayOf,
  dayToWire,
  lifecycleActions,
  linesOf,
  partyPriority,
  recordPath,
} from './context-kinds';
import { draftRaciWarnings } from './form/raci-editor';
import { cleanFilters, listFilters, toListQuery } from './list/list-config';
import { registerTiles } from './overview/context-overview';
import { columnLoad } from './raci/raci-matrix';
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

  it('counts accountable and responsible load per matrix column', () => {
    const load = columnLoad({
      columns: [
        { type: 'role', value: 'ciso', name: null },
        { type: 'user', value: 'u1', name: 'Ada' },
      ],
      rows: [
        {
          id: 'r1',
          code: 'RACI-1',
          title: 'A',
          area: null,
          cells: { 'role:ciso': 'A', 'user:u1': 'R' },
          warnings: [],
        },
        {
          id: 'r2',
          code: 'RACI-2',
          title: 'B',
          area: null,
          cells: { 'role:ciso': 'A' },
          warnings: [],
        },
      ],
    });
    expect(load['role:ciso']).toEqual({ a: 2, r: 0 });
    expect(load['user:u1']).toEqual({ a: 0, r: 1 });
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
