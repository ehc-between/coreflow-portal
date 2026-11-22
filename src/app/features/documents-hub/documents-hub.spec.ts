import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { DocumentSummary } from '../../core/documents/document.models';
import { ApiService } from '../../core/http/api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocationsApi } from '../../core/locations/locations-api';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { TasksApi } from '../../core/tasks/tasks-api';
import { WorkItem } from '../../core/tasks/task.models';
import { loc } from '../company/hub-kit/hub.testing';
import { HomeApi } from '../dashboard/data/home-api';
import { DocumentControlApi } from '../documents/data/document-control-api';
import documentsRoutes from '../documents/documents.routes';
import { DocumentsHub } from './documents-hub';
import {
  isHandbookType,
  isWaitingDocument,
  kindMatches,
  nonHandbookDocuments,
  requirementLabels,
  reviewCell,
  sortDocuments,
  sortWaiting,
  waitingKind,
} from './documents-hub-data';
import { kindQuery } from './kind-redirect';

function doc(over: Partial<DocumentSummary>): DocumentSummary {
  return {
    id: over.id ?? 'd',
    type: 'policy',
    title: 'Doc',
    doc_code: 'POL-1',
    status: 'approved',
    owner_user_id: 'u',
    current_rev: 'A',
    updated_at: '2026-11-01T00:00:00',
    ...over,
  };
}

function work(over: Partial<WorkItem>): WorkItem {
  return {
    source: 'document_ack',
    id: 'w',
    title: 'Doc',
    code: null,
    status: null,
    priority: null,
    due_at: null,
    url: '/documents/d1',
    entity_type: 'document',
    entity_id: 'd1',
    module: 'documents',
    overdue: false,
    ...over,
  } as WorkItem;
}

describe('Dokumenter data', () => {
  it('keeps work procedures out, by the type flag or the default keys', () => {
    expect(isHandbookType('procedure', [])).toBe(true);
    expect(isHandbookType('process', [])).toBe(true);
    expect(isHandbookType('policy', [])).toBe(false);
    expect(isHandbookType('procedure', [{ key: 'procedure', handbook: false }])).toBe(false);
    expect(isHandbookType('plan', [{ key: 'plan', handbook: true }])).toBe(true);
    const docs = [
      doc({ id: '1', type: 'policy' }),
      doc({ id: '2', type: 'procedure' }),
      doc({ id: '3', type: 'form' }),
    ];
    expect(nonHandbookDocuments(docs, []).map((d) => d.id)).toEqual(['1']);
  });

  it('matches kinds, plans by prefix', () => {
    expect(kindMatches('policy', 'policy')).toBe(true);
    expect(kindMatches('plan_bcp', 'plan')).toBe(true);
    expect(kindMatches('planning', 'policy')).toBe(false);
  });

  it('puts documents waiting for approval first, then the soonest review', () => {
    const sorted = sortDocuments([
      doc({ id: 'a', status: 'approved', next_review_at: '2028-01-01' }),
      doc({ id: 'b', status: 'approved', next_review_at: '2027-01-01' }),
      doc({ id: 'c', status: 'in_review' }),
      doc({ id: 'd', status: 'draft' }),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('shows the next review as a pill when close, else the month', () => {
    const now = new Date(2026, 10, 22);
    expect(reviewCell(null, now)).toEqual({ kind: 'none' });
    expect(reviewCell('2026-11-01T12:00:00', now)).toMatchObject({ kind: 'pill', tone: 'fail' });
    expect(reviewCell('2026-11-27T12:00:00', now)).toMatchObject({
      key: 'hubs.documents.review.inDays',
      count: 5,
    });
    expect(reviewCell('2026-12-13T12:00:00', now)).toMatchObject({
      key: 'hubs.documents.review.inWeeks',
      count: 3,
    });
    expect(reviewCell('2027-03-01T12:00:00', now)).toEqual({
      kind: 'month',
      iso: '2027-03-01T12:00:00',
    });
  });

  it('dedupes requirement labels', () => {
    expect(requirementLabels(['a:1.r1', 'a:1.r2', 'b:2'], (r) => r.replace(/\.r\d$/, ''))).toEqual([
      'a:1',
      'b:2',
    ]);
    expect(requirementLabels(null, (r) => r)).toEqual([]);
  });

  it('finds document approvals and read confirmations, approvals first', () => {
    const items = [
      work({ id: '1', source: 'document_ack', lane: 'acknowledge' }),
      work({ id: '2', source: 'document_review', lane: 'review', group: 'awaiting_review' }),
      work({ id: '3', source: 'task', module: 'documents', lane: 'work', group: 'overdue' }),
      work({ id: '4', source: 'requirement_suggestions', module: 'standards', lane: 'review' }),
    ];
    const waiting = items.filter(isWaitingDocument);
    expect(waiting.map((w) => w.id)).toEqual(['1', '2']);
    expect(waitingKind(waiting[0])).toBe('acknowledge');
    expect(sortWaiting(waiting).map((w) => w.id)).toEqual(['2', '1']);
  });

  it('turns ?kind= into the list type filter, keeping the rest', () => {
    expect(kindQuery({ kind: 'plan', status: 'approved' })).toEqual({
      status: 'approved',
      type: 'plan',
    });
    expect(kindQuery({ type: 'policy' })).toBeNull();
  });
});

describe('documents routes (IA v2)', () => {
  const group = documentsRoutes[0] as Route;
  const paths = (group.children ?? []).map((r) => r.path);

  it('moves the list to all and adds the hub sub-pages', () => {
    expect(paths).toContain('all');
    expect(paths).toContain('templates');
    expect(paths).toContain('archive');
    expect(paths).toContain('waiting');
    expect(paths).not.toContain('');
    expect((group.children ?? []).find((r) => r.path === 'all')?.canActivate?.length).toBe(1);
  });

  it('still redirects a template URL to its settings page', () => {
    const tpl = documentsRoutes.find((r) => r.path === 'templates/:id');
    expect(tpl?.data?.['moduleConfigTarget']).toBe('/settings/modules/documents/templates/:id');
  });
});

describe('DocumentsHub', () => {
  it('shows the six doors and the non-procedure documents', async () => {
    const get = vi.fn(() =>
      of([
        doc({
          id: 'p1',
          type: 'policy',
          title: 'Kvalitetspolicy',
          status: 'in_review',
          type_name: 'Policy',
        }),
        doc({
          id: 'p2',
          type: 'policy',
          title: 'Personvern',
          type_name: 'Policy',
          requirement_links: { confirmed: 1, suggested: 0, refs: ['gdpr-2016:30.r1'] },
        }),
        doc({ id: 'pl', type: 'plan', title: 'Plan', type_name: 'Plan' }),
        doc({ id: 'pr', type: 'procedure', title: 'Prosedyre', type_name: 'Prosedyre' }),
      ]),
    );
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ApiService, useValue: { get } },
        {
          provide: LocationsApi,
          useValue: {
            counts: vi.fn(() =>
              of({
                items: [
                  loc('documents.templates', 4),
                  loc('documents.external', 6),
                  loc('continuity.plans', 2),
                ],
                generated_at: '',
              }),
            ),
          },
        },
        { provide: HomeApi, useValue: { nextActions: vi.fn(() => of({ items: [] })) } },
        { provide: DocumentControlApi, useValue: { listTypes: vi.fn(() => of([])) } },
        { provide: OutputsApi, useValue: { generated: vi.fn(() => of({ items: [], total: 27 })) } },
        {
          provide: TasksApi,
          useValue: {
            myWork: vi.fn(() =>
              of({
                items: [
                  work({ id: '1', lane: 'acknowledge' }),
                  work({ id: '2', source: 'task', lane: 'work' }),
                ],
              }),
            ),
          },
        },
        { provide: ModuleService, useValue: { isEnabled: () => true } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal('org-1'),
            currentOrg: signal({
              id: 'org-1',
              name: 'Acme',
              roles: [],
              permissions: ['documents:read', 'documents:draft'],
            }),
          },
        },
        {
          provide: LanguageService,
          useValue: { active: signal('nb'), translate: (k: string) => k },
        },
      ],
    });
    const fixture = TestBed.createComponent(DocumentsHub);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(get).toHaveBeenCalledWith('v1/orgs/org-1/documents', { params: { handbook: 'false' } });
    const count = (key: string) =>
      el.querySelector(`[data-key="${key}"] [data-testid="hub-tile-count"]`)?.textContent?.trim();
    expect(count('policies')).toBe('2');
    expect(count('plans')).toBe('1');
    expect(count('templates')).toBe('4');
    expect(count('external')).toBe('6');
    expect(count('archive')).toBe('27');
    expect(count('waiting')).toBe('1');
    expect(el.querySelector('[data-key="policies"]')?.getAttribute('href')).toBe(
      '/documents/all?kind=policy',
    );

    const rows = [...el.querySelectorAll('[data-testid="documents-row"]')];
    expect(rows.map((r) => r.querySelector('a')?.textContent?.trim())).toEqual([
      'Kvalitetspolicy',
      'Personvern',
      'Plan',
    ]);
    expect(el.querySelector('[data-testid="documents-other-plans"]')?.textContent).toContain(
      'hubs.documents.continuityPlans',
    );
    expect(el.querySelector('[data-testid="documents-new"]')?.getAttribute('href')).toBe(
      '/documents/new',
    );
    // Vis krav is off by default: no requirement chips on the hub.
    expect(el.querySelector('[data-testid="req-pills"]')).toBeNull();
  });
});
