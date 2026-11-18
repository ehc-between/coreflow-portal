import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { EvaluationDetail, UpdateEvaluationRequest } from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { EvaluationDetailPage } from './evaluation-detail';

const EVALUATION: EvaluationDetail = {
  id: 'ev-1',
  supplier: { id: 'sup-1', code: 'SUP-001', name: 'Acme Parts', url: '/suppliers/sup-1' },
  kind: 'periodic',
  title: 'Annual review',
  status: 'draft',
  score: null,
  recommendation: null,
  decision: null,
  evaluator: null,
  due_at: null,
  overdue: false,
  submitted_at: null,
  decided_at: null,
  url: '/suppliers/sup-1/evaluations/ev-1',
  created_at: '2026-11-01T10:00:00',
  updated_at: '2026-11-01T10:00:00',
  template_ref: null,
  questions: [
    {
      id: 'q1',
      text: 'Certified quality system?',
      help: null,
      category: 'quality',
      type: 'yes_no',
      weight: 1,
      max_score: 1,
      critical: false,
      required: true,
    },
  ],
  answers: { q1: { value: 'no', comment: null } },
  pass_score: 70,
  scoring: { points: 0, max_points: 1, answered: 1, total: 1 },
  critical_failures: [],
  summary: null,
  submitted_by: null,
  decision_notes: null,
  conditions: null,
  decided_by: null,
  created_by: null,
  can_edit: true,
  can_decide: false,
};

/** The protected surface the regression tests drive (the assistant flow is out of scope). */
interface PageInternals {
  useAiSummary(text: string): void;
  setAnswer(change: { id: string; answer: { value: string; comment: string } }): void;
  startEditQuestions(): void;
  saveQuestions(): void;
  summaryDraft(): string;
}

async function setup(evaluation: EvaluationDetail = EVALUATION) {
  let server = evaluation;
  const api = {
    getEvaluation: vi.fn(() => of(server)),
    updateEvaluation: vi.fn((_org: string, _id: string, body: UpdateEvaluationRequest) => {
      server = {
        ...server,
        ...(body.questions ? { pass_score: body.pass_score ?? server.pass_score } : {}),
        // Like the server: the summary is stored trimmed (blank -> null).
        ...('summary' in body ? { summary: body.summary?.trim() || null } : {}),
        ...(body.answers
          ? {
              answers: Object.fromEntries(
                Object.entries(body.answers).map(([k, a]) => [
                  k,
                  { value: a.value, comment: a.comment ?? null },
                ]),
              ),
            }
          : {}),
      };
      return of(server);
    }),
    submitEvaluation: vi.fn(() => {
      server = { ...server, status: 'submitted', submitted_at: '2026-11-02T10:00:00' };
      return of(server);
    }),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [EvaluationDetailPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...provideFakeGuidance().providers,
      { provide: SuppliersApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      { provide: AskPanelService, useValue: { askAbout: vi.fn(), showWith: vi.fn() } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({
            id: 'org-1',
            name: 'Acme',
            roles: [],
            permissions: ['suppliers:read', 'suppliers:write'],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(EvaluationDetailPage);
  fixture.componentRef.setInput('id', 'sup-1');
  fixture.componentRef.setInput('eid', 'ev-1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const page = fixture.componentInstance as unknown as PageInternals;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (key: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith(key));
  return { fixture, el, page, api, toasts, render, button };
}

describe('EvaluationDetailPage summary (S10)', () => {
  it('keeps an adopted suggestion through "Save answers" and saves it with the answers', async () => {
    const { page, api, render, button, el } = await setup();
    page.useAiSummary('Strong delivery record; certification pending.');
    page.setAnswer({ id: 'q1', answer: { value: 'yes', comment: '' } });
    await render();

    button('suppliers.evaluation.saveAnswers')!.click();
    await render();

    expect(api.updateEvaluation).toHaveBeenCalledTimes(1);
    expect(api.updateEvaluation).toHaveBeenCalledWith(
      'org-1',
      'ev-1',
      {
        answers: { q1: { value: 'yes', comment: null } },
        summary: 'Strong delivery record; certification pending.',
      },
      'en',
    );
    expect(page.summaryDraft()).toBe('Strong delivery record; certification pending.');
    const textarea = el.querySelector<HTMLTextAreaElement>('#ev-summary')!;
    expect(textarea.value).toBe('Strong delivery record; certification pending.');
  });

  it('enables "Save answers" for an unsaved summary alone and saves only the summary', async () => {
    const { page, api, render, button, toasts } = await setup();
    const save = button('suppliers.evaluation.saveAnswers')!;
    expect(save.disabled).toBe(true);

    page.useAiSummary('Adopted text');
    await render();
    expect(save.disabled).toBe(false);
    save.click();
    await render();

    expect(api.updateEvaluation).toHaveBeenCalledWith(
      'org-1',
      'ev-1',
      {
        summary: 'Adopted text',
      },
      'en',
    );
    expect(toasts.success).toHaveBeenCalledWith('suppliers.evaluation.summarySaved');
  });

  it('treats a saved summary as saved even when the server trims it', async () => {
    const { page, api, render, button } = await setup();
    page.useAiSummary('Adopted text\n\n');
    await render();
    const save = button('suppliers.evaluation.saveAnswers')!;
    save.click();
    await render();

    expect(api.updateEvaluation).toHaveBeenCalledTimes(1);
    expect(page.summaryDraft()).toBe('Adopted text');
    expect(save.disabled).toBe(true);
  });

  it('does not wipe an unsaved summary when another part of the evaluation is saved', async () => {
    const { page, api, render } = await setup();
    page.useAiSummary('Not saved yet');
    page.startEditQuestions();
    page.saveQuestions();
    await render();
    expect(api.updateEvaluation).toHaveBeenCalledWith(
      'org-1',
      'ev-1',
      expect.not.objectContaining({ summary: expect.anything() }),
      'en',
    );
    expect(page.summaryDraft()).toBe('Not saved yet');
  });

  it('saves the unsaved summary before submitting for decision', async () => {
    const { page, api, render, button } = await setup();
    page.useAiSummary('Adopted text');
    await render();

    button('suppliers.evaluation.submit')!.click();
    await render();

    expect(api.updateEvaluation).toHaveBeenCalledWith(
      'org-1',
      'ev-1',
      {
        summary: 'Adopted text',
      },
      'en',
    );
    expect(api.submitEvaluation).toHaveBeenCalledWith('org-1', 'ev-1', 'en');
    expect(api.updateEvaluation.mock.invocationCallOrder[0]).toBeLessThan(
      api.submitEvaluation.mock.invocationCallOrder[0],
    );
  });

  it('warns before submitting with an empty summary and submits only on "Submit anyway"', async () => {
    const { api, render, button, el } = await setup();

    button('suppliers.evaluation.submit')!.click();
    await render();

    expect(api.submitEvaluation).not.toHaveBeenCalled();
    expect(el.textContent).toContain('suppliers.evaluation.submitNoSummaryTitle');

    button('suppliers.evaluation.submitAnyway')!.click();
    await render();

    expect(api.submitEvaluation).toHaveBeenCalledTimes(1);
    expect(api.updateEvaluation).not.toHaveBeenCalled();
  });

  it('does not submit when the empty-summary warning is cancelled', async () => {
    const { api, render, button, el } = await setup();
    button('suppliers.evaluation.submit')!.click();
    await render();

    button('common.cancel')!.click();
    await render();

    expect(api.submitEvaluation).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain('suppliers.evaluation.submitNoSummaryTitle');
  });

  it('submits without a warning when a summary is already saved', async () => {
    const { api, render, button, el } = await setup({ ...EVALUATION, summary: 'Saved summary' });
    button('suppliers.evaluation.submit')!.click();
    await render();

    expect(el.textContent).not.toContain('suppliers.evaluation.submitNoSummaryTitle');
    expect(api.updateEvaluation).not.toHaveBeenCalled();
    expect(api.submitEvaluation).toHaveBeenCalledTimes(1);
  });
});
