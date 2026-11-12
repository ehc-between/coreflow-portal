import { HttpErrorResponse } from '@angular/common/http';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PageContextService } from '../../core/ai/page-context';
import {
  inspectionsTestingProviders,
  inspectionsTransloco,
  makeFinding,
  makeInspection,
  makeInspectionDetail,
  makeTemplateDetail,
} from './data/inspections.testing';
import { FindingsList, parseFindingFilters, toFindingQuery } from './findings/findings-list';
import { InspectionDetailPage } from './inspections/inspection-detail';
import { InspectionRun } from './inspections/inspection-run';
import {
  DEFAULT_INSPECTION_FILTERS,
  InspectionsList,
  parseInspectionFilters,
  toInspectionQuery,
} from './list/inspections-list';
import { TemplateBuilder, parseThreshold } from './templates/template-builder';
import { TemplateLibrary } from './templates/template-library';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const STATS = {
  by_status: { planned: 1, in_progress: 1, completed: 3, cancelled: 0 },
  overdue: 1,
  passed: 2,
  failed: 1,
  average_score_pct: 82.5,
  open_findings: 2,
};

function mount<T>(
  component: Type<T>,
  api: Record<string, unknown>,
  inputs: Record<string, unknown> = {},
  permissions?: readonly string[],
) {
  const doubles = inspectionsTestingProviders(api, permissions);
  TestBed.configureTestingModule({
    imports: [component, inspectionsTransloco()],
    providers: doubles.providers,
  });
  const fixture = TestBed.createComponent(component);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const byTestId = <E extends Element = HTMLElement>(id: string) =>
    el.querySelector<E>(`[data-testid="${id}"]`);
  const render = async () => {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, byTestId, render, ...doubles };
}

describe('inspections list', () => {
  it('parses filters defensively and builds the list query', () => {
    expect(parseInspectionFilters({ status: 'bogus', overdue: 'true' })).toEqual({
      ...DEFAULT_INSPECTION_FILTERS,
      overdue: 'true',
    });
    expect(toInspectionQuery(' a ', DEFAULT_INSPECTION_FILTERS, 25)).toMatchObject({
      q: 'a',
      status: ['planned', 'in_progress'],
      sort: 'due_at',
      offset: 25,
    });
    expect(
      toInspectionQuery('', { ...DEFAULT_INSPECTION_FILTERS, status: '' }, 0).status,
    ).toBeUndefined();
  });

  it('renders rows and stats and registers page context', async () => {
    const list = vi.fn(() => of({ items: [makeInspection()], total: 1 }));
    const { byTestId, render } = mount(InspectionsList, { list, stats: () => of(STATS) });
    await render();
    expect(list).toHaveBeenCalledWith('org-1', expect.objectContaining({ offset: 0 }));
    expect(byTestId('inspection-rows')?.textContent).toContain('Warehouse walk');
    expect(byTestId('stats')).not.toBeNull();
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      module: 'inspections',
      view: 'list',
    });
  });

  it('teaches with an empty state when the org has no inspections', async () => {
    const empty = {
      ...STATS,
      by_status: { planned: 0, in_progress: 0, completed: 0, cancelled: 0 },
    };
    const { el, render } = mount(InspectionsList, {
      list: () => of({ items: [], total: 0 }),
      stats: () => of(empty),
    });
    await render();
    expect(el.querySelector('app-teaching-empty')).not.toBeNull();
  });

  it('hides "Plan inspection" without inspections:write', async () => {
    const { byTestId, render } = mount(
      InspectionsList,
      { list: () => of({ items: [], total: 0 }), stats: () => of(STATS) },
      {},
      ['inspections:read'],
    );
    await render();
    expect(byTestId('new-inspection')).toBeNull();
  });
});

describe('findings list', () => {
  it('builds the query from filters', () => {
    const f = parseFindingFilters({ deviation: 'false', severity: 'high' });
    expect(toFindingQuery('', f, 0)).toMatchObject({
      status: ['open'],
      severity: ['high'],
      has_deviation: false,
    });
  });

  it('links each finding to its inspection', async () => {
    const { byTestId, render } = mount(FindingsList, {
      listFindings: () => of({ items: [makeFinding()], total: 1 }),
    });
    await render();
    const link = byTestId('finding-rows')?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/inspections/i-1?finding=f-1');
  });
});

describe('inspection run', () => {
  it('saves an answer shortly after it is given and shows live failures', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const detail = makeInspectionDetail();
      const saveResponses = vi.fn(() => of({ ...detail, answered_count: 1 }));
      const { byTestId, fixture, render } = mount(
        InspectionRun,
        { get: () => of(detail), saveResponses },
        { id: 'i-1' },
      );
      await render();
      byTestId<HTMLButtonElement>('answer-q1-no')!.click();
      fixture.detectChanges();
      expect(byTestId('answer-q1')?.textContent).toContain('inspections.run.failed');
      expect(saveResponses).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(700);
      expect(saveResponses).toHaveBeenCalledWith('org-1', 'i-1', [
        { question_id: 'q1', value: 'no', is_na: false, note: null },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists missing required answers before completing', async () => {
    const { byTestId, fixture, render } = mount(
      InspectionRun,
      { get: () => of(makeInspectionDetail()) },
      { id: 'i-1' },
    );
    await render();
    byTestId<HTMLElement>('open-complete')!.querySelector('button')!.click();
    fixture.detectChanges();
    await render();
    expect(document.querySelector('[data-testid="missing-list"]')?.textContent).toContain(
      'Exits clear?',
    );
  });

  it('is read-only without perform rights', async () => {
    const detail = makeInspectionDetail({
      permissions: { can_edit: false, can_perform: false, can_manage: false },
    });
    const { byTestId, render } = mount(InspectionRun, { get: () => of(detail) }, { id: 'i-1' });
    await render();
    expect(byTestId<HTMLButtonElement>('answer-q1-yes')?.disabled).toBe(true);
    expect(byTestId('open-complete')).toBeNull();
  });
});

describe('inspection detail', () => {
  it('shows answers, findings and opens a finding from the URL', async () => {
    const detail = makeInspectionDetail({
      status: 'completed',
      result: 'failed',
      responses: [
        {
          question_id: 'q1',
          value: 'no',
          is_na: false,
          note: 'Pallet in the way',
          attachment_ids: [],
          failed: true,
          score_earned: 0,
          score_possible: 1,
          answered_by: null,
          answered_at: '2026-11-03T09:10:00',
        },
      ],
      findings: [makeFinding()],
    });
    const { byTestId, render } = mount(
      InspectionDetailPage,
      { get: () => of(detail) },
      { id: 'i-1', finding: 'f-1' },
    );
    await render();
    expect(byTestId('result-badge')?.textContent).toContain('inspections.result.failed');
    expect(byTestId('response-q1')?.textContent).toContain('Pallet in the way');
    expect(byTestId('finding-list')?.textContent).toContain('FND-0001');
    expect(document.querySelector('[data-testid="finding-panel"]')).not.toBeNull();
    expect(TestBed.inject(PageContextService).current()).toMatchObject({
      entityType: 'inspection_finding',
      entityId: 'f-1',
    });
  });
});

describe('template builder', () => {
  it('parses the pass mark', () => {
    expect(parseThreshold('')).toBeNull();
    expect(parseThreshold('80')).toBe(80);
    expect(Number.isNaN(parseThreshold('120') as number)).toBe(true);
  });

  it('validates, then creates a draft with the questions', async () => {
    const createTemplate = vi.fn(() => of(makeTemplateDetail({ status: 'draft' })));
    const { byTestId, fixture, render, toasts } = mount(TemplateBuilder, { createTemplate });
    await render();
    byTestId<HTMLElement>('add-yes_no')!.querySelector('button')!.click();
    fixture.detectChanges();
    byTestId<HTMLElement>('save-template')!.querySelector('button')!.click();
    fixture.detectChanges();
    expect(createTemplate).not.toHaveBeenCalled();

    const title = byTestId<HTMLInputElement>('template-title-input')!;
    title.value = 'Fire check';
    title.dispatchEvent(new Event('input'));
    const text = byTestId<HTMLTextAreaElement>('question-text')!;
    text.value = 'Extinguishers in place?';
    text.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byTestId<HTMLElement>('save-template')!.querySelector('button')!.click();
    await render();
    expect(createTemplate).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        title: 'Fire check',
        status: 'draft',
        questions: [expect.objectContaining({ text: 'Extinguishers in place?', type: 'yes_no' })],
      }),
    );
    expect(toasts.success).toHaveBeenCalledWith('inspections.notices.templateSaved');
  });

  it('highlights rows the server rejected', async () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'invalid_questions', problems: [{ index: 0, message: 'x' }] } },
    });
    const { byTestId, render, toasts } = mount(
      TemplateBuilder,
      {
        getTemplate: () => of(makeTemplateDetail({ status: 'draft' })),
        updateTemplate: () => throwError(() => error),
      },
      { id: 't-1' },
    );
    await render();
    byTestId<HTMLElement>('save-template')!.querySelector('button')!.click();
    await render();
    expect(toasts.error).toHaveBeenCalledWith('inspections.errors.invalid_questions');
    expect(byTestId('question-0')?.textContent).toContain('inspections.builder.problems.server');
  });
});

describe('template library', () => {
  it('imports a library checklist as a draft', async () => {
    const importLibraryTemplate = vi.fn(() =>
      of(makeTemplateDetail({ id: 't-9', status: 'draft' })),
    );
    const { byTestId, render } = mount(TemplateLibrary, {
      listLibrary: () =>
        of([
          {
            key: 'fire_safety',
            title: 'Fire safety',
            description: 'd',
            category: 'safety',
            frameworks: ['iso45001'],
            question_count: 12,
            pass_threshold: 80,
          },
        ]),
      importLibraryTemplate,
    });
    await render();
    byTestId<HTMLElement>('import-fire_safety')!.querySelector('button')!.click();
    expect(importLibraryTemplate).toHaveBeenCalledWith('org-1', 'fire_safety', 'en');
  });
});
