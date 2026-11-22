import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import en from '../../../assets/i18n/handbook/en.json';
import nb from '../../../assets/i18n/handbook/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { WorkItem } from '../../core/tasks/task.models';
import {
  firstName,
  groupProcedures,
  isEmptyMap,
  moveInBand,
  procedurePill,
  waitingItems,
  withUnit,
} from './data/handbook.logic';
import { HandbookApi } from './data/handbook-api';
import {
  HandbookBox,
  HandbookDocument,
  HandbookMap,
  HandbookProcedure,
} from './data/handbook.models';
import { parseTab } from './handbook-page';

const box = (id: string, extra: Partial<HandbookBox> = {}): HandbookBox => ({
  id,
  code: id,
  title: id,
  category: 'core',
  chain_order: null,
  status: 'active',
  owner: null,
  procedure_count: 0,
  procedure_ids: [],
  dot: 'ok',
  dot_reason: null,
  open_cases: 0,
  ...extra,
});

const doc = (id: string): HandbookDocument => ({
  id,
  type: 'procedure',
  title: `Doc ${id}`,
  doc_code: null,
  status: 'approved',
  current_rev: 'A',
});

const proc = (extra: Partial<HandbookProcedure> = {}): HandbookProcedure => ({
  id: 'd',
  title: 'D',
  code: null,
  type: 'procedure',
  status: 'approved',
  version: 'B',
  approved_at: null,
  read_pct: null,
  review_overdue: false,
  review_soon: false,
  url: null,
  ...extra,
});

describe('handbook logic', () => {
  it('keeps en/nb at parity', () => expectKeyParity(en, nb));

  it('reads the tab from the query string', () => {
    expect(parseTab('procedures')).toBe('procedures');
    expect(parseTab('waiting')).toBe('waiting');
    expect(parseTab('nope')).toBe('map');
    expect(parseTab(null)).toBe('map');
  });

  it('shortens the owner to a first name', () => {
    expect(firstName('Anne Berg (daglig leder)')).toBe('Anne');
    expect(firstName(null)).toBe('');
  });

  it('groups procedures by process, core first, and puts the rest last', () => {
    const map: HandbookMap = {
      management: [box('m', { category: 'management', procedure_ids: ['2'] })],
      core: [box('c', { procedure_ids: ['1', 'gone'] })],
      support: [box('s', { category: 'support' })],
    };
    const groups = groupProcedures(map, [doc('1'), doc('2'), doc('3')]);
    expect(groups.map((g) => g.process?.id ?? null)).toEqual(['c', 'm', null]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(['1']);
    expect(groups[2].documents.map((d) => d.id)).toEqual(['3']);
    expect(isEmptyMap(map)).toBe(false);
    expect(isEmptyMap({ management: [], core: [], support: [] })).toBe(true);
  });

  it('moves a process within its band and ignores moves off the ends', () => {
    expect(moveInBand(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveInBand(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveInBand(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('picks the pill that needs attention first', () => {
    expect(procedurePill(proc({ review_overdue: true, read_pct: 90 })).key).toBe(
      'handbook.procedure.reviewOverdue',
    );
    expect(procedurePill(proc({ read_pct: 92 }))).toEqual({
      key: 'handbook.procedure.readPct',
      params: { pct: 92 },
      tone: 'pass',
    });
    expect(procedurePill(proc({ read_pct: 40 })).tone).toBe('warn');
    expect(procedurePill(proc()).key).toBe('handbook.procedure.approved');
    expect(procedurePill(proc({ status: 'draft' })).key).toBe('handbook.procedure.draft');
  });

  it('formats KPI values with units', () => {
    expect(withUnit(94, '%')).toBe('94 %');
    expect(withUnit('2', 'dager')).toBe('2 dager');
    expect(withUnit(null, '%')).toBe('–');
  });

  it('keeps only my approvals and read confirmations of work procedures', () => {
    const item = (extra: Partial<WorkItem>): WorkItem => ({
      source: 'task',
      id: Math.random().toString(),
      title: 't',
      code: null,
      status: null,
      priority: null,
      due_at: null,
      url: null,
      entity_type: null,
      entity_id: null,
      module: null,
      overdue: false,
      ...extra,
    });
    const id = '11111111-1111-1111-1111-111111111111';
    const items = [
      item({ source: 'document_ack', entity_type: 'document', entity_id: id }),
      item({ lane: 'review', url: `/documents/${id}` }),
      item({ lane: 'work', entity_type: 'document', entity_id: id }),
      item({ source: 'document_ack', entity_type: 'document', entity_id: 'other' }),
    ];
    expect(waitingItems(items, new Set([id]))).toHaveLength(2);
  });
});

describe('HandbookApi', () => {
  it('calls the handbook endpoints', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(HandbookApi);
    const http = TestBed.inject(HttpTestingController);
    api.map('o').subscribe();
    api.page('o', 'p').subscribe();
    api.setOrder('o', 'core', ['a', 'b']).subscribe();
    api.procedures('o').subscribe();
    expect(
      http.expectOne((r) => r.url.endsWith('/v1/orgs/o/processes/handbook')).request.method,
    ).toBe('GET');
    expect(http.expectOne((r) => r.url.endsWith('/v1/orgs/o/processes/p/handbook'))).toBeTruthy();
    const order = http.expectOne((r) => r.url.endsWith('/processes/handbook/order'));
    expect(order.request.method).toBe('PUT');
    expect(order.request.body).toEqual({ category: 'core', ids: ['a', 'b'] });
    const docs = http.expectOne((r) => r.url.endsWith('/v1/orgs/o/documents'));
    expect(docs.request.params.get('handbook')).toBe('true');
  });
});
